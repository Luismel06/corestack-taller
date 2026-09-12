import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessSections,
  editablePermissions,
  sectionPermissions,
  filterAccessPermissions,
} from '../lib/employee-access.ts';
test('las cuatro áreas incluyen cada permiso integrado exactamente una vez', () => {
  const all = accessSections.flatMap((section) => sectionPermissions(section.id));
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...all].sort(), [...editablePermissions].sort());
  assert.ok(!all.includes('invoices.void'));
});
test('buscador y filtro de excepciones conservan denegaciones y no modifican permisos', () => {
  const overrides = { 'cash.open': false, 'quotes.create': true };
  assert.deepEqual(filterAccessPermissions('billing', 'abrir', true, overrides), ['cash.open']);
  assert.ok(filterAccessPermissions('all', 'facturacion', false, {}).length > 0);
  assert.deepEqual(filterAccessPermissions('inventory', '', true, overrides), []);
  assert.deepEqual(filterAccessPermissions('all', '', true, overrides).sort(), [
    'cash.open',
    'quotes.create',
  ]);
  assert.deepEqual(overrides, { 'cash.open': false, 'quotes.create': true });
});
