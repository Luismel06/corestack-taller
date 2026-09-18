import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectivePermissions, legacyPermissions, permissions } from '@qorvex/permissions';
import { canAccessPath, getDefaultPathForSession, hasPermission } from '../lib/authorization.ts';

function session(role, permissionOverrides = {}) {
  const effective = effectivePermissions({ role, permissionOverrides });
  return { role, permissions: { ...effective, ...legacyPermissions(effective) } };
}

test('cada rol heredado entra a su espacio y Caja queda disponible para sus roles operativos', () => {
  const cases = {
    ADMIN: '/workshop',
    MANAGER: '/workshop',
    SERVICE_ADVISOR: '/workshop',
    SUPERVISOR: '/workshop',
    MECHANIC: '/access',
    RECEPTIONIST: '/workshop/agenda',
    INVENTORY_MANAGER: '/products',
    CASHIER: '/pos',
    ACCOUNTING: '/dashboard',
  };
  for (const [role, path] of Object.entries(cases)) {
    const current = session(role);
    assert.equal(getDefaultPathForSession(current), path, role);
    assert.equal(canAccessPath(current, path), true, role);
    assert.equal(canAccessPath(current, '/pos'), ['ADMIN', 'CASHIER'].includes(role), role);
  }
});

test('Toma de Órdenes inicia en la agenda operativa y el mecánico no recibe vistas propias', () => {
  const orderTaker = session('ORDER_TAKER');
  assert.equal(getDefaultPathForSession(orderTaker), '/workshop/agenda');
  assert.equal(canAccessPath(orderTaker, '/workshop/agenda'), true);
  assert.equal(canAccessPath(orderTaker, '/workshop'), true);
  assert.equal(canAccessPath(orderTaker, '/pos'), true);
  assert.equal(canAccessPath(orderTaker, '/purchase-orders'), false);
  assert.equal(canAccessPath(orderTaker, '/invoices/example/print'), true);
  assert.equal(canAccessPath(orderTaker, '/invoices'), false);
  assert.equal(canAccessPath(session('ORDER_TAKER', { 'invoices.reprint': false }), '/invoices/example/print'), false);
  const mechanic = session('MECHANIC');
  assert.equal(canAccessPath(mechanic, '/workshop'), false);
  assert.equal(getDefaultPathForSession(mechanic), '/access');
});

test('las denegaciones actualizadas prevalecen sobre rol y navegación anterior', () => {
  for (const [path, permission] of [
    ['/workshop', 'workorders.view'],
    ['/customers', 'customers.view'],
    ['/products', 'inventory.view'],
    ['/products/new', 'products.manage'],
    ['/employees', 'employees.manage'],
    ['/settings/fiscal-sequences', 'settings.fiscal'],
    ['/cash/sessions', 'cash.view'],
  ])
    assert.equal(canAccessPath(session('ADMIN', { [permission]: false }), path), false, path);
  assert.equal(canAccessPath(session('CASHIER', { 'pos.sell': false }), '/pos'), false);
  assert.equal(canAccessPath(session('ADMIN'), '/cash/registers'), false);
  assert.equal(
    hasPermission(session('ADMIN', { 'workorders.deliver': false }), 'workorders.deliver'),
    false,
  );
});

test('administrador y coordinador pueden operar Caja sin depender del rol Cajero', () => {
  for (const role of ['ADMIN', 'ORDER_TAKER']) {
    const current = session(role);
    assert.equal(canAccessPath(current, '/pos'), true, role);
    assert.equal(hasPermission(current, 'pos.sell'), true, `${role}: cobrar`);
    assert.equal(hasPermission(current, 'cash.open'), true, `${role}: abrir caja`);
    assert.equal(hasPermission(current, 'cash.close'), true, `${role}: cerrar caja`);
  }
});

test('el coordinador opera las OT completas pero no elimina expedientes creados', () => {
  const coordinator = session('ORDER_TAKER');
  for (const permission of [
    'workorders.view',
    'workorders.create',
    'workorders.edit',
    'workorders.assign',
    'workorders.change_status',
    'workorders.diagnose',
    'workorders.quality',
    'workorders.deliver',
    'workorders.send_to_cashier',
    'quotes.create',
    'quotes.record_approval',
    'inventory.workshop_parts',
    'inventory.adjust',
  ])
    assert.equal(hasPermission(coordinator, permission), true, permission);
  assert.equal(hasPermission(coordinator, 'workorders.cancel'), false);
  assert.equal(hasPermission(coordinator, 'appointments.manage'), true);
  assert.equal(
    hasPermission(session('ORDER_TAKER', { 'workorders.cancel': true }), 'workorders.cancel'),
    false,
  );
});

test('lectura, creación de productos y reimpresión se pueden separar', () => {
  const accounting = session('ACCOUNTING', { 'invoices.reprint': false });
  assert.equal(canAccessPath(accounting, '/invoices/record'), true);
  assert.equal(canAccessPath(accounting, '/invoices/record/print'), false);
  assert.equal(canAccessPath(accounting, '/products'), true);
  assert.equal(canAccessPath(accounting, '/products/new'), false);
  assert.equal(canAccessPath(session('CASHIER'), '/invoices'), false);
  assert.equal(canAccessPath(session('CASHIER'), '/invoices/record/print'), true);
});

test('sin módulos habilitados hay destino seguro sin bucle; sesiones heredadas siguen funcionando', () => {
  const noAccess = session('MECHANIC', Object.fromEntries(permissions.map((key) => [key, false])));
  assert.equal(getDefaultPathForSession(noAccess), '/access');
  assert.equal(canAccessPath(noAccess, '/access'), true);
  assert.equal(getDefaultPathForSession(null), '/login');
  assert.equal(canAccessPath(null, '/access'), false);
  assert.equal(
    canAccessPath({ role: 'ORDER_TAKER', permissions: { canTakeOrders: true } }, '/orders'),
    true,
  );
  assert.equal(hasPermission({ role: 'MECHANIC', permissions: {} }, 'workorders.deliver'), false);
});

test('roles del taller acceden al ERP por permisos sin depender del rol anterior', () => {
  for (const role of ['MANAGER', 'ACCOUNTING', 'ACCOUNTANT']) {
    const current = session(role);
    for (const path of [
      '/purchase-orders',
      '/suppliers',
      '/supplier-invoices',
      '/payables',
      '/receivables',
      '/credit-approvals',
      '/operations/logs',
    ])
      assert.equal(canAccessPath(current, path), true, `${role}: ${path}`);
  }
  const inventory = session('INVENTORY_MANAGER');
  assert.equal(canAccessPath(inventory, '/purchase-orders'), true);
  assert.equal(hasPermission(inventory, 'purchasing.create'), true);
  assert.equal(hasPermission(inventory, 'purchasing.approve'), false);
  assert.equal(hasPermission(inventory, 'payables.pay'), false);
  assert.equal(hasPermission(session('ACCOUNTING'), 'receivables.collect'), false);
  assert.equal(hasPermission(session('ACCOUNTANT'), 'receivables.collect'), true);
  const accountant = session('ACCOUNTANT');
  for (const path of [
    '/dashboard',
    '/invoices',
    '/receivables',
    '/payables',
    '/credit-approvals',
    '/returns',
    '/settings/fiscal-sequences',
  ])
    assert.equal(canAccessPath(accountant, path), true, `ACCOUNTANT: ${path}`);
  for (const permission of [
    'invoices.manage',
    'receivables.collect',
    'payables.pay',
    'credit.approve',
    'returns.approve',
    'settings.fiscal',
  ])
    assert.equal(hasPermission(accountant, permission), true, `ACCOUNTANT: ${permission}`);
  assert.equal(hasPermission(accountant, 'employees.manage'), false);
  assert.equal(hasPermission(accountant, 'pos.sell'), false);
});

test('revocación explícita se respeta en todos los accesos ERP, incluso administrador', () => {
  const routes = {
    '/suppliers': 'suppliers.view',
    '/purchase-orders': 'purchasing.view',
    '/supplier-invoices': 'supplier_invoices.view',
    '/payables': 'payables.view',
    '/receivables': 'receivables.view',
    '/credit-approvals': 'credit.view',
    '/returns': 'returns.view',
    '/operations/logs': 'audit.view',
  };
  for (const [path, permission] of Object.entries(routes)) {
    assert.equal(canAccessPath(session('ADMIN', { [permission]: false }), path), false, path);
    assert.equal(canAccessPath(session('MECHANIC'), path), false, path);
  }
  const onlyPayables = session('MECHANIC', {
    ...Object.fromEntries(permissions.map((key) => [key, false])),
    'payables.view': true,
  });
  assert.equal(getDefaultPathForSession(onlyPayables), '/payables');
});
