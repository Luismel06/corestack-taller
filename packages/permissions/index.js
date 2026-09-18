const maxTenantUsers = 5;
const permissionLabels = {
  'workorders.view': 'Consultar órdenes de trabajo',
  'workorders.external': 'Gestionar servicios externos',
  'workorders.warranty': 'Gestionar garantías y reclamos',
  'vehicles.maintenance': 'Programar mantenimiento preventivo',
  'cash.advances': 'Recibir anticipos de órdenes de trabajo',
  'cash.refund_advances': 'Reembolsar anticipos no aplicados',
  'payables.expenses': 'Registrar gastos del taller',
  'workorders.create': 'Crear órdenes de trabajo',
  'workorders.edit': 'Editar datos de la orden',
  'workorders.assign': 'Asignar mecánicos y tareas',
  'workorders.change_status': 'Cambiar estado operativo',
  'workorders.cancel': 'Cancelar órdenes',
  'workorders.diagnose': 'Registrar diagnóstico e inspección',
  'workorders.quality': 'Aprobar o rechazar calidad',
  'workorders.deliver': 'Registrar entrega de vehículos',
  'workorders.send_to_cashier': 'Enviar reparación a caja',
  'tasks.progress': 'Registrar avance de tareas',
  'tasks.cancel': 'Cancelar tareas',
  'quotes.create': 'Preparar presupuestos y adicionales',
  'quotes.record_approval': 'Registrar respuesta del cliente',
  'vehicles.view': 'Consultar vehículos e historial',
  'vehicles.manage': 'Registrar y editar vehículos',
  'reception.manage': 'Registrar y editar recepción',
  'appointments.manage': 'Gestionar citas',
  'services.manage': 'Gestionar catálogo de servicios',
  'inventory.view': 'Consultar inventario',
  'inventory.workshop_parts': 'Entregar, devolver y liberar repuestos de OT',
  'inventory.adjust': 'Ajustar inventario',
  'products.manage': 'Gestionar productos',
  'customers.view': 'Consultar clientes',
  'customers.manage': 'Registrar y editar clientes',
  'customers.credit': 'Configurar crédito de clientes',
  'customers.archive': 'Desactivar clientes',
  'employees.manage': 'Administrar empleados y accesos',
  'pos.sell': 'Cobrar ventas en POS',
  'cash.open': 'Abrir caja',
  'cash.close': 'Cerrar caja',
  'cash.view': 'Consultar movimientos y cierres',
  'invoices.reprint': 'Reimprimir comprobantes',
  'invoices.view': 'Consultar facturación',
  'invoices.manage': 'Gestionar borradores de factura',
  'invoices.cancel': 'Cancelar facturas',
  'invoices.void': 'Anular facturas',
  'sales.discount': 'Aplicar descuentos',
  'sales.orders': 'Tomar órdenes comerciales',
  'reports.financial': 'Consultar reportes financieros',
  'settings.fiscal': 'Administrar secuencias fiscales',
  'suppliers.view': 'Consultar proveedores',
  'suppliers.manage': 'Gestionar proveedores y su catálogo',
  'purchasing.view': 'Consultar órdenes de compra',
  'purchasing.create': 'Preparar y solicitar compras',
  'purchasing.approve': 'Revisar, emitir, pausar y reanudar compras',
  'purchasing.cancel': 'Cancelar compras',
  'supplier_invoices.view': 'Consultar facturas de proveedores',
  'supplier_invoices.manage': 'Capturar facturas de proveedores',
  'supplier_invoices.cancel': 'Cancelar facturas de proveedores',
  'inventory.receive': 'Registrar y confirmar entrada de mercancía',
  'inventory.reverse_receipt': 'Cancelar o revertir entradas de mercancía',
  'payables.view': 'Consultar cuentas por pagar',
  'payables.pay': 'Registrar pagos a proveedores',
  'payables.cancel_payment': 'Anular pagos a proveedores',
  'receivables.view': 'Consultar cuentas por cobrar y recibos',
  'receivables.collect': 'Registrar abonos de clientes',
  'receivables.cancel_payment': 'Anular abonos de clientes',
  'credit.view': 'Consultar solicitudes de crédito',
  'credit.approve': 'Aprobar o rechazar ventas a crédito',
  'credit.override_limit': 'Autorizar exceso del límite de crédito',
  'returns.view': 'Consultar devoluciones propias',
  'returns.view_all': 'Consultar devoluciones de todos los empleados',
  'returns.request': 'Solicitar devoluciones',
  'returns.approve': 'Aprobar o rechazar devoluciones',
  'cash.deposit': 'Registrar entradas manuales de dinero',
  'cash.withdraw': 'Registrar retiros de caja',
  'cash.adjust': 'Registrar ajustes de caja',
  'audit.view': 'Consultar auditoría y actividad de empleados',
};
const permissions = Object.keys(permissionLabels);
const roleLabels = {
  ADMIN: 'Administrador',
  ORDER_TAKER: 'Coordinador',
  ACCOUNTANT: 'Contador',
  MECHANIC: 'Mecánico (recurso)',
};
const readWorkshop = ['workorders.view', 'vehicles.view', 'customers.view', 'inventory.view'];
const reception = [
  ...readWorkshop,
  'workorders.create',
  'vehicles.manage',
  'customers.manage',
  'reception.manage',
  'appointments.manage',
];
const advisor = [
  ...reception,
  'workorders.external',
  'workorders.warranty',
  'vehicles.maintenance',
  'workorders.edit',
  'workorders.assign',
  'workorders.change_status',
  'workorders.diagnose',
  'workorders.deliver',
  'workorders.send_to_cashier',
  'tasks.progress',
  'tasks.cancel',
  'quotes.create',
  'quotes.record_approval',
  'sales.orders',
];
const supervisor = [
  ...readWorkshop,
  'workorders.edit',
  'workorders.assign',
  'workorders.change_status',
  'workorders.diagnose',
  'workorders.quality',
  'tasks.progress',
  'tasks.cancel',
  'inventory.workshop_parts',
];
const admin = [...permissions];
const accountingRead = [
  'suppliers.view',
  'purchasing.view',
  'supplier_invoices.view',
  'payables.view',
  'receivables.view',
  'credit.view',
  'audit.view',
];
const rolePermissions = {
  ADMIN: admin,
  MANAGER: admin.filter(
    (key) =>
      ![
        'employees.manage',
        'settings.fiscal',
        'pos.sell',
        'cash.open',
        'cash.close',
      ].includes(key),
  ),
  SERVICE_ADVISOR: advisor,
  RECEPTIONIST: reception,
  SUPERVISOR: supervisor,
  // El esquema actual vincula EmployeeProfile a User. El perfil se conserva para poder
  // asignarlo a órdenes, pero no recibe un espacio de navegación ni permisos operativos.
  MECHANIC: [],
  INVENTORY_MANAGER: [
    ...readWorkshop,
    'suppliers.view',
    'purchasing.view',
    'purchasing.create',
    'supplier_invoices.view',
    'supplier_invoices.manage',
    'inventory.receive',
    'products.manage',
    'inventory.adjust',
    'inventory.workshop_parts',
  ],
  CASHIER: [
    'cash.advances',
    'returns.view',
    'returns.request',
    'customers.view',
    'inventory.view',
    'pos.sell',
    'cash.open',
    'cash.close',
    'invoices.reprint',
  ],
  ACCOUNTING: [
    'payables.expenses',
    ...accountingRead,
    'purchasing.create',
    'supplier_invoices.manage',
    'invoices.view',
    'customers.view',
    'inventory.view',
    'reports.financial',
    'cash.view',
    'invoices.reprint',
  ],
  ACCOUNTANT: [
    'payables.expenses',
    ...accountingRead,
    'purchasing.create',
    'supplier_invoices.manage',
    'inventory.receive',
    'payables.pay',
    'payables.cancel_payment',
    'receivables.collect',
    'receivables.cancel_payment',
    'invoices.view',
    'invoices.manage',
    'invoices.cancel',
    'invoices.void',
    'customers.view',
    'inventory.view',
    'reports.financial',
    'cash.view',
    'invoices.reprint',
    'credit.approve',
    'returns.view',
    'returns.view_all',
    'returns.approve',
    'settings.fiscal',
  ],
  // Preserve the prior advisor's operational access when migrating.
  ORDER_TAKER: [
    ...advisor,
    'workorders.quality',
    'inventory.workshop_parts',
    'inventory.adjust',
    'products.manage',
    'services.manage',
    'pos.sell',
    'cash.open',
    'cash.close',
    'invoices.reprint',
  ],
  SUPER_ADMIN: permissions,
  QORVEX_SUPER_ADMIN: permissions,
};
const legacyPermissionMap = {
  canUsePos: 'pos.sell',
  canOpenCashSession: 'cash.open',
  canCloseCashSession: 'cash.close',
  canApplyDiscount: 'sales.discount',
  canCancelInvoice: 'invoices.cancel',
  canVoidInvoice: 'invoices.void',
  canAdjustInventory: 'inventory.adjust',
  canManageProducts: 'products.manage',
  canManageEmployees: 'employees.manage',
  canViewReports: 'reports.financial',
  canManageFiscalSequences: 'settings.fiscal',
  canViewCashLogs: 'cash.view',
  canReprintReceipt: 'invoices.reprint',
  canTakeOrders: 'sales.orders',
};
function effectivePermissions(membership) {
  const granted = new Set(rolePermissions[membership.role] || []);
  for (const [field, permission] of Object.entries(legacyPermissionMap)) {
    if (membership[field] === true) granted.add(permission);
    // Existing cashier restrictions must not be expanded by a role default.
    if (
      membership.role === 'CASHIER' &&
      membership[field] === false &&
      ['cash.open', 'cash.close', 'invoices.reprint'].includes(permission)
    )
      granted.delete(permission);
  }
  const overrides = membership.permissionOverrides;
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    for (const permission of permissions) {
      if (overrides[permission] === true) granted.add(permission);
      if (overrides[permission] === false) granted.delete(permission);
    }
  }
  // User/access administration remains a tenant administrator responsibility.
  if (!['ADMIN', 'SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'].includes(membership.role))
    granted.delete('employees.manage');
  // El coordinador administra todo el flujo operativo, pero una OT creada se conserva
  // como expediente. Las citas pendientes se cancelan con appointments.manage.
  if (membership.role === 'ORDER_TAKER') granted.delete('workorders.cancel');
  return Object.fromEntries(permissions.map((permission) => [permission, granted.has(permission)]));
}
function legacyPermissions(effective) {
  return Object.fromEntries(
    Object.entries(legacyPermissionMap).map(([field, permission]) => [
      field,
      effective[permission] === true,
    ]),
  );
}
module.exports = {
  maxTenantUsers,
  permissionLabels,
  permissions,
  roleLabels,
  rolePermissions,
  legacyPermissionMap,
  effectivePermissions,
  legacyPermissions,
};
