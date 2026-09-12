import type { AuthSession } from './auth-session';
import { effectivePermissions } from '@qorvex/permissions';

export function hasPermission(session: AuthSession | null | undefined, permission: string) {
  if (!session) return false;
  if (typeof session.permissions[permission] === 'boolean') return session.permissions[permission];
  // Sessions opened before the permission catalog was introduced have legacy fields only.
  return effectivePermissions({ role: session.role, ...session.permissions })[permission] === true;
}

const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'];
const accountantExactPaths = new Set([
  '/dashboard',
  '/products',
  '/customers',
  '/inventory',
  '/invoices',
  '/cash/logs',
  '/cash/sessions',
  '/operations/logs',
]);
const accountantNestedPaths = [
  '/dashboard/',
  '/invoices/',
  '/suppliers/',
  '/purchase-orders/',
  '/supplier-invoices/',
  '/payables/',
  '/receivables/',
  '/credit-approvals/',
  '/operations/logs/',
];
const accountantModulePaths = new Set([
  '/suppliers',
  '/purchase-orders',
  '/supplier-invoices',
  '/payables',
  '/receivables',
  '/credit-approvals',
]);

export function isAdminSession(session: AuthSession | null | undefined) {
  return Boolean(session?.role && adminRoles.includes(session.role));
}

export function isAccountantSession(session: AuthSession | null | undefined) {
  return session?.role === 'ACCOUNTANT' || session?.role === 'ACCOUNTING';
}

export function canTakeOrders(session: AuthSession | null | undefined) {
  return hasPermission(session, 'sales.orders');
}

export function canAccessPath(session: AuthSession | null | undefined, pathname: string) {
  if (!session) {
    return false;
  }

  const isPath = (root: string) => pathname === root || pathname.startsWith(`${root}/`);
  if (isPath('/access')) return true;
  // Specific route policies precede role fallbacks: an explicit denial also applies to admins.
  if (isPath('/workshop/vehicles')) return hasPermission(session, 'vehicles.view');
  if (isPath('/workshop/agenda')) return hasPermission(session, 'appointments.manage');
  if (isPath('/workshop/bays') || isPath('/workshop/services'))
    return hasPermission(session, 'workorders.view');
  if (isPath('/workshop')) return hasPermission(session, 'workorders.view');
  if (isPath('/employees')) return hasPermission(session, 'employees.manage');
  if (isPath('/pos')) return hasPermission(session, 'pos.sell') && !isAdminSession(session);
  if (isPath('/orders')) return canTakeOrders(session);
  if (isPath('/customers')) return hasPermission(session, 'customers.view');
  if (isPath('/products'))
    return hasPermission(session, pathname === '/products' ? 'inventory.view' : 'products.manage');
  if (isPath('/inventory')) return hasPermission(session, 'inventory.view');
  if (isPath('/dashboard')) return hasPermission(session, 'reports.financial');
  if (isPath('/cash/sessions'))
    return session.role !== 'CASHIER' && hasPermission(session, 'cash.view');
  if (isPath('/cash/logs')) return hasPermission(session, 'cash.view');
  if (isPath('/settings/fiscal-sequences')) return hasPermission(session, 'settings.fiscal');
  const erpRoutes: Record<string, string> = {
    '/suppliers': 'suppliers.view',
    '/purchase-orders': 'purchasing.view',
    '/supplier-invoices': 'supplier_invoices.view',
    '/payables': 'payables.view',
    '/receivables': 'receivables.view',
    '/credit-approvals': 'credit.view',
    '/returns': 'returns.view',
    '/operations/logs': 'audit.view',
  };
  for (const [path, permission] of Object.entries(erpRoutes)) {
    if (isPath(path)) return hasPermission(session, permission);
  }
  if (isPath('/invoices'))
    return hasPermission(
      session,
      pathname.endsWith('/print') ? 'invoices.reprint' : 'invoices.view',
    );

  if (session.role === 'ACCOUNTANT') {
    return (
      accountantExactPaths.has(pathname) ||
      accountantModulePaths.has(pathname) ||
      accountantNestedPaths.some((prefix) => pathname.startsWith(prefix))
    );
  }

  if (session.role === 'ADMIN' && (pathname === '/pos' || pathname.startsWith('/pos/'))) {
    return false;
  }

  if (pathname === '/quotations' || pathname.startsWith('/quotations/')) {
    return isAdminSession(session);
  }

  if (pathname === '/returns' || pathname.startsWith('/returns/')) {
    return isAdminSession(session) || Boolean(session.permissions.canUsePos);
  }

  if (isAdminSession(session)) {
    return true;
  }

  if (session.permissions.canUsePos && (pathname === '/pos' || pathname.startsWith('/pos/'))) {
    return true;
  }

  if (canTakeOrders(session) && (pathname === '/orders' || pathname.startsWith('/orders/'))) {
    return true;
  }

  if (
    (isAdminSession(session) || session.role === 'ORDER_TAKER') &&
    (pathname === '/workshop' || pathname.startsWith('/workshop/'))
  ) {
    return true;
  }

  return Boolean(
    session.permissions.canReprintReceipt &&
    pathname.startsWith('/invoices/') &&
    pathname.endsWith('/print'),
  );
}

export function getDefaultPathForSession(session: AuthSession | null | undefined) {
  if (!session) {
    return '/login';
  }

  const preferred =
    session.role === 'INVENTORY_MANAGER'
      ? '/products'
      : session.role === 'ORDER_TAKER'
        ? '/workshop/agenda'
        : session.role === 'RECEPTIONIST'
          ? '/workshop/agenda'
        : session.role === 'CASHIER'
          ? '/pos'
          : hasPermission(session, 'workorders.view')
            ? '/workshop'
            : '/dashboard';
  return [
    preferred,
    '/workshop',
    '/pos',
    '/dashboard',
    '/products',
    '/customers',
    '/employees',
    '/cash/sessions',
    '/purchase-orders',
    '/supplier-invoices',
    '/payables',
    '/receivables',
    '/suppliers',
    '/credit-approvals',
    '/returns',
    '/operations/logs',
    '/access',
  ].find((path) => path === '/access' || canAccessPath(session, path))!;
}
