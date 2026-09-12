import { permissionLabels, permissions } from '@qorvex/permissions';

const pending = new Set(['invoices.cancel', 'invoices.void', 'sales.discount']);
export const editablePermissions = permissions.filter((key) => !pending.has(key));
export const accessSections = [
  {
    id: 'workshop',
    label: 'Taller y clientes',
    prefixes: [
      'workorders',
      'tasks',
      'quotes',
      'vehicles',
      'reception',
      'appointments',
      'services',
      'bays',
      'customers',
    ],
  },
  {
    id: 'inventory',
    label: 'Inventario y compras',
    prefixes: ['inventory', 'products', 'suppliers', 'purchasing', 'supplier_invoices'],
  },
  {
    id: 'billing',
    label: 'Caja y facturación',
    prefixes: ['pos', 'cash', 'invoices', 'sales', 'payables', 'receivables', 'credit', 'returns'],
  },
  { id: 'admin', label: 'Administración', prefixes: ['employees', 'reports', 'settings', 'audit'] },
];
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export function sectionPermissions(sectionId: string) {
  const section = accessSections.find((item) => item.id === sectionId);
  return editablePermissions.filter((key) => section?.prefixes.includes(key.split('.')[0]));
}
export function filterAccessPermissions(
  sectionId: string,
  query: string,
  onlyChanged: boolean,
  overrides: Record<string, boolean>,
) {
  const term = normalize(query);
  return (sectionId === 'all' ? editablePermissions : sectionPermissions(sectionId)).filter(
    (key) => {
      if (onlyChanged && overrides[key] === undefined) return false;
      const section = accessSections.find((item) => item.prefixes.includes(key.split('.')[0]));
      return !term || normalize(`${permissionLabels[key]} ${section?.label ?? ''}`).includes(term);
    },
  );
}
