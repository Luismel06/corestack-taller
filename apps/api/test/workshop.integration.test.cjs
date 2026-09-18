const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('@qorvex/database');
const { WorkshopService } = require('../dist/modules/workshop/workshop.service');
const { AuditService } = require('../dist/modules/audit/audit.service');
const { PosService } = require('../dist/modules/pos/pos.service');
const { InventoryService } = require('../dist/modules/inventory/inventory.service');
const { ProductsService } = require('../dist/modules/products/products.service');
const { CashService } = require('../dist/modules/cash/cash.service');
const { buildPaymentPlan } = require('../dist/modules/pos/payment-plan');
const { Prisma } = require('@qorvex/database');
const { taskTimeTotals } = require('../dist/modules/workshop/task-time');
const { EmployeesService } = require('../dist/modules/employees/employees.service');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { WorkshopController } = require('../dist/modules/workshop/workshop.controller');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { Reflector } = require('@nestjs/core');
const { effectivePermissions } = require('@qorvex/permissions');
const { JwtService } = require('@nestjs/jwt');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { TenantMembershipGuard } = require('../dist/common/guards/tenant-membership.guard');
const { AuthController } = require('../dist/modules/auth/auth.controller');
const { CustomersController } = require('../dist/modules/customers/customers.controller');
const { ProductsController } = require('../dist/modules/products/products.controller');
const { InvoicesController } = require('../dist/modules/invoices/invoices.controller');
const { InvoicesService } = require('../dist/modules/invoices/invoices.service');
const { PurchasingService } = require('../dist/modules/purchasing/purchasing.service');
const { ReceiptsService } = require('../dist/modules/receipts/receipts.service');
const { ReceiptsController } = require('../dist/modules/receipts/receipts.controller');
const {
  SupplierInvoicesService,
} = require('../dist/modules/supplier-invoices/supplier-invoices.service');
const {
  SupplierInvoicesController,
} = require('../dist/modules/supplier-invoices/supplier-invoices.controller');
const { SuppliersController } = require('../dist/modules/suppliers/suppliers.controller');
const { ReceivablesService } = require('../dist/modules/receivables/receivables.service');
const {
  CreditApprovalsService,
} = require('../dist/modules/credit-approvals/credit-approvals.service');
const { ReturnsService } = require('../dist/modules/returns/returns.service');
const {
  populateWorkshopDemo,
} = require('../../../packages/database/prisma/seed-workshop-demo.cjs');

// Every run owns a random PostgreSQL schema, with all real migrations applied.
// Tests never use the public schema, existing customers, invoices or fiscal ranges.
const schema = `workshop_test_${randomUUID().replaceAll('-', '')}`;
let control;
let db;
let workshop;
let createdSchema = false;
const quality = {
  status: 'APPROVED',
  workCompleted: true,
  partsVerified: true,
  leaksChecked: true,
  fluidsChecked: true,
  warningLightsChecked: true,
  roadTested: true,
  toolsRemoved: true,
  vehicleCleaned: true,
};
const evidence = {
  authorizedByName: 'Cliente de pruebas',
  method: 'PHONE',
  note: 'Respuesta registrada durante la prueba.',
};

before(
  async () => {
    const source = new URL(process.env.WORKSHOP_TEST_DATABASE_URL || process.env.DATABASE_URL);
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname),
      'Use a local PostgreSQL database for these integration tests.',
    );
    const url = new URL(source);
    url.searchParams.set('schema', schema);
    control = new PrismaClient({ datasourceUrl: source.toString() });
    await control.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    createdSchema = true;
    const root = path.resolve(__dirname, '../../..');
    const prismaCli = require.resolve('prisma/build/index.js', {
      paths: [path.join(root, 'packages/database')],
    });
    try {
      await promisify(execFile)(
        process.execPath,
        [
          prismaCli,
          'migrate',
          'deploy',
          '--schema',
          path.join(root, 'packages/database/prisma/schema.prisma'),
        ],
        {
          cwd: root,
          env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() },
          timeout: 60000,
          windowsHide: true,
        },
      );
    } catch (error) {
      // Avoid logging connection credentials from child process errors.
      throw new Error(
        `Could not apply migrations to isolated schema (${error.code ?? 'unknown error'}).`,
      );
    }
    db = new PrismaClient({ datasourceUrl: url.toString() });
    workshop = new WorkshopService(db, new AuditService(db));
  },
  { timeout: 70000 },
);

after(async () => {
  if (db) await db.$disconnect();
  if (createdSchema) {
    assert.match(schema, /^workshop_test_[a-f0-9]{32}$/);
    await control.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
  if (control) await control.$disconnect();
});

async function fixture({ count = 2, stock = 10 } = {}) {
  const tenant = await db.tenant.create({
    data: { name: 'Taller de pruebas', slug: `test-${randomUUID()}` },
  });
  const user = await db.user.create({
    data: { name: 'Asesor de pruebas', email: `${randomUUID()}@example.test` },
  });
  const customer = await db.customer.create({
    data: { tenantId: tenant.id, name: 'Cliente de pruebas', documentType: 'CONSUMER_FINAL' },
  });
  const vehicle = await workshop.createVehicle(tenant.id, user.id, {
    customerId: customer.id,
    make: 'Toyota',
    model: 'Corolla',
    licensePlate: 'TEST001',
    mileage: 1000,
  });
  const products = [];
  for (let i = 0; i < count; i++)
    products.push(
      await db.product.create({
        data: {
          tenantId: tenant.id,
          name: `Repuesto ${i + 1}`,
          price: 100 * (i + 1),
          stock,
          sku: `TEST-${i + 1}`,
        },
      }),
    );
  const ticket = await workshop.createTicket(tenant.id, user.id, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    complaint: 'Diagnóstico de prueba',
    lines: products.map((product) => ({
      type: 'PART',
      productId: product.id,
      description: product.name,
      quantity: 1,
      unitPrice: Number(product.price),
    })),
  });
  return { tenant, user, customer, vehicle, products, ticket };
}

async function sendQuote(f) {
  await workshop.createReception(f.tenant.id, f.user.id, f.ticket.id, { mileage: 1000 });
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'DIAGNOSIS' });
  await workshop.saveInspection(f.tenant.id, f.user.id, f.ticket.id, {
    items: [{ code: 'BRAKES', label: 'Frenos', result: 'REQUIRES_REPAIR' }],
  });
  f.ticket = await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'AWAITING_APPROVAL',
  });
  return f.ticket;
}

async function approve(f, status = 'APPROVED', approvedLineIds) {
  f.ticket = await workshop.respondApproval(f.tenant.id, f.user.id, f.ticket.id, {
    ...evidence,
    status,
    quoteVersionId: f.ticket.quoteVersions[0].id,
    approvedLineIds,
  });
  return f.ticket;
}

async function repairing(f) {
  await sendQuote(f);
  await approve(f);
  f.ticket = await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'IN_PROGRESS',
  });
}

function additionalPayload(f) {
  return {
    title: 'Trabajo adicional detectado',
    lines: [
      {
        productId: f.products[0].id,
        type: 'PART',
        description: 'Repuesto adicional',
        quantity: 1,
        unitPrice: 75,
      },
    ],
  };
}

async function issueAll(f) {
  const ticket = await db.workshopTicket.findUniqueOrThrow({
    where: { id: f.ticket.id },
    include: { lines: true },
  });
  for (const line of ticket.lines.filter(
    (item) => item.approvalStatus === 'APPROVED' && item.reservedQuantity > 0,
  )) {
    await workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, line.id, 'consume', {
      quantity: line.reservedQuantity,
      operationKey: randomUUID(),
    });
  }
}

test('no se puede saltar del diagnóstico a aprobación o reparación', async () => {
  const f = await fixture();
  await workshop.createReception(f.tenant.id, f.user.id, f.ticket.id, { mileage: 1000 });
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'DIAGNOSIS' });
  for (const status of ['APPROVED', 'IN_PROGRESS', 'READY_FOR_DELIVERY']) {
    await assert.rejects(
      workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status }),
      /transición/,
    );
  }
  await assert.rejects(
    workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {}),
    /listo para entrega/,
  );
  assert.equal(await db.salesOrder.count({ where: { tenantId: f.tenant.id } }), 0);
});

test('presupuesto enviado es inmutable y rechaza versiones o líneas ajenas', async () => {
  const f = await fixture();
  await sendQuote(f);
  const payload = {
    ...evidence,
    quoteVersionId: f.ticket.quoteVersions[0].id,
    status: 'PARTIALLY_APPROVED',
  };
  await assert.rejects(
    workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { lines: [] }),
    /presupuesto enviado/,
  );
  await assert.rejects(
    workshop.respondApproval(f.tenant.id, f.user.id, f.ticket.id, {
      ...payload,
      quoteVersionId: 'old-version',
      approvedLineIds: [f.ticket.lines[0].id],
    }),
    /versión vigente/,
  );
  await assert.rejects(
    workshop.respondApproval(f.tenant.id, f.user.id, f.ticket.id, {
      ...payload,
      approvedLineIds: ['another-ticket-line'],
    }),
    /únicamente líneas/,
  );
  await assert.rejects(
    workshop.respondApproval(f.tenant.id, f.user.id, f.ticket.id, {
      ...payload,
      approvedLineIds: [],
    }),
    /aprobación parcial/,
  );
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).reservedStock,
    0,
  );
});

test('aprobación parcial reserva y envía a Caja solo los trabajos aceptados', async () => {
  const f = await fixture();
  await sendQuote(f);
  const accepted = f.ticket.lines.find((line) => line.productId === f.products[0].id);
  await approve(f, 'PARTIALLY_APPROVED', [accepted.id]);
  assert.equal(f.ticket.total.toString(), '100');
  assert.equal(f.ticket.quoteVersions[0].decision.authorizedByName, evidence.authorizedByName);
  assert.deepEqual(f.ticket.quoteVersions[0].decision.approvedLineIds, [accepted.id]);
  assert.equal(f.ticket.lines.filter((line) => line.approvalStatus === 'REJECTED').length, 1);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).reservedStock,
    1,
  );
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.products[1].id } })).reservedStock,
    0,
  );
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'IN_PROGRESS' });
  await issueAll(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'READY_FOR_DELIVERY',
  });
  const order = await workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {});
  const items = await db.salesOrderItem.findMany({ where: { salesOrderId: order.id } });
  assert.equal(items.length, 1);
  assert.equal(items[0].productId, accepted.productId);
  assert.equal(order.total.toString(), '118');
});

test('rechazo total no reserva inventario ni permite cobrar', async () => {
  const f = await fixture();
  await sendQuote(f);
  await approve(f, 'REJECTED');
  assert.equal(f.ticket.status, 'DIAGNOSIS');
  assert.ok(f.ticket.lines.every((line) => line.approvalStatus === 'REJECTED'));
  assert.equal(f.ticket.total.toString(), '0');
  assert.equal(
    (
      await db.product.aggregate({
        where: { tenantId: f.tenant.id },
        _sum: { reservedStock: true },
      })
    )._sum.reservedStock,
    0,
  );
  await assert.rejects(workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {}));
});

test('dos aprobaciones simultáneas registran una sola respuesta y reserva', async () => {
  const f = await fixture({ count: 1 });
  await sendQuote(f);
  const payload = { ...evidence, status: 'APPROVED', quoteVersionId: f.ticket.quoteVersions[0].id };
  const results = await Promise.allSettled(
    [1, 2].map(() => workshop.respondApproval(f.tenant.id, f.user.id, f.ticket.id, payload)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).reservedStock,
    1,
  );
  assert.equal(
    await db.workshopTicketStatusEvent.count({
      where: { ticketId: f.ticket.id, toStatus: 'APPROVED' },
    }),
    1,
  );
});

test('adicional rechazado se conserva y nunca se suma al presupuesto', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  const change = await workshop.createChangeOrder(
    f.tenant.id,
    f.user.id,
    f.ticket.id,
    additionalPayload(f),
  );
  await assert.rejects(
    workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality),
    /adicionales pendientes/,
  );
  await workshop.respondChangeOrder(f.tenant.id, f.user.id, f.ticket.id, change.id, {
    ...evidence,
    status: 'REJECTED',
  });
  assert.equal(await db.workshopTicketLine.count({ where: { ticketId: f.ticket.id } }), 1);
  assert.equal(
    (await db.workshopTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).total.toString(),
    '100',
  );
  assert.equal(
    (await db.workshopChangeOrder.findUniqueOrThrow({ where: { id: change.id } })).status,
    'REJECTED',
  );
});

test('adicional aprobado bajo concurrencia agrega una línea y exige nuevo control de calidad', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  const change = await workshop.createChangeOrder(
    f.tenant.id,
    f.user.id,
    f.ticket.id,
    additionalPayload(f),
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      workshop.respondChangeOrder(f.tenant.id, f.user.id, f.ticket.id, change.id, {
        ...evidence,
        status: 'APPROVED',
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await db.workshopTicketLine.count({ where: { ticketId: f.ticket.id } }), 2);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).reservedStock,
    2,
  );
  assert.equal(
    (await db.workshopTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).total.toString(),
    '175',
  );
  assert.equal(
    (await db.workshopQualityCheck.findUniqueOrThrow({ where: { ticketId: f.ticket.id } })).status,
    'PENDING',
  );
  await assert.rejects(
    workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'READY_FOR_DELIVERY' }),
    /control de calidad/,
  );
});

test('falta de stock revierte respuesta, líneas y total del adicional', async () => {
  const f = await fixture({ count: 1, stock: 1 });
  await repairing(f);
  const change = await workshop.createChangeOrder(
    f.tenant.id,
    f.user.id,
    f.ticket.id,
    additionalPayload(f),
  );
  await assert.rejects(
    workshop.respondChangeOrder(f.tenant.id, f.user.id, f.ticket.id, change.id, {
      ...evidence,
      status: 'APPROVED',
    }),
    /suficiente existencia/,
  );
  assert.equal(
    (await db.workshopChangeOrder.findUniqueOrThrow({ where: { id: change.id } })).status,
    'PENDING',
  );
  assert.equal(await db.workshopTicketLine.count({ where: { ticketId: f.ticket.id } }), 1);
  assert.equal(
    (await db.workshopTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).total.toString(),
    '100',
  );
});

test('doble envío a Caja crea una sola orden y bloquea cambios posteriores', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  await issueAll(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'READY_FOR_DELIVERY',
  });
  const results = await Promise.allSettled(
    [1, 2].map(() => workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {})),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await db.salesOrder.count({ where: { tenantId: f.tenant.id } }), 1);
  await assert.rejects(
    workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'IN_PROGRESS' }),
    /enviada a Caja/,
  );
  await assert.rejects(
    workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, { title: 'Otra tarea' }),
    /orden debe estar abierta/,
  );
});

test('entrega bloqueada con saldo o factura anulada; pago completo habilita una sola entrega', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  await issueAll(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'READY_FOR_DELIVERY',
  });
  const order = await workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {});
  const invoice = await db.invoice.create({
    data: {
      tenantId: f.tenant.id,
      invoiceNumber: 'TEST-UNPAID',
      status: 'ISSUED',
      total: 118,
      balance: 118,
    },
  });
  await db.salesOrder.update({ where: { id: order.id }, data: { invoiceId: invoice.id } });
  const delivery = { recipientName: f.customer.name, mileageOut: 1005 };
  await assert.rejects(
    workshop.createDelivery(f.tenant.id, f.user.id, f.ticket.id, delivery),
    /Completa el pago/,
  );
  await db.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED', balance: 0 } });
  await assert.rejects(
    workshop.createDelivery(f.tenant.id, f.user.id, f.ticket.id, delivery),
    /Completa el pago/,
  );
  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: 'PAID', paidAmount: 118, balance: 0 },
  });
  const results = await Promise.allSettled(
    [1, 2].map(() => workshop.createDelivery(f.tenant.id, f.user.id, f.ticket.id, delivery)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await db.workshopTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).status,
    'DELIVERED',
  );
  assert.equal(
    await db.workshopTicketStatusEvent.count({
      where: { ticketId: f.ticket.id, toStatus: 'DELIVERED' },
    }),
    1,
  );
});

test('cancelación libera reservas y conserva el adicional cancelado', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  const change = await workshop.createChangeOrder(
    f.tenant.id,
    f.user.id,
    f.ticket.id,
    additionalPayload(f),
  );
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'CANCELLED' });
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).reservedStock,
    0,
  );
  assert.equal(
    (await db.workshopChangeOrder.findUniqueOrThrow({ where: { id: change.id } })).status,
    'CANCELLED',
  );
  await assert.rejects(
    workshop.respondChangeOrder(f.tenant.id, f.user.id, f.ticket.id, change.id, {
      ...evidence,
      status: 'APPROVED',
    }),
  );
});

test('permisos del mecánico y doble inicio no duplican el registro de tiempo', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  const mechanic = await db.user.create({
    data: {
      name: 'Mecánico',
      email: `${randomUUID()}@example.test`,
      memberships: { create: { tenantId: f.tenant.id, role: 'MECHANIC' } },
    },
  });
  const employee = await db.employeeProfile.create({
    data: { tenantId: f.tenant.id, userId: mechanic.id },
  });
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'REPAIR',
    ticketLineId: f.ticket.lines[0].id,
    title: 'Instalar repuesto',
    employeeId: employee.id,
  });
  const actor = { id: mechanic.id, memberships: [{ tenantId: f.tenant.id, role: 'MECHANIC' }] };
  await assert.rejects(
    workshop.updateTask(f.tenant.id, actor, f.ticket.id, task.id, { employeeId: employee.id }),
    /asignación corresponde al asesor/,
  );
  await assert.rejects(
    workshop.updateTask(f.tenant.id, { ...actor, id: f.user.id }, f.ticket.id, task.id, {
      status: 'IN_PROGRESS',
    }),
    /tienes asignadas/,
  );
  await Promise.all(
    [1, 2].map(() =>
      workshop.updateTask(f.tenant.id, actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' }),
    ),
  );
  assert.equal(
    await db.workshopTaskTimeEntry.count({ where: { taskId: task.id, event: 'START' } }),
    1,
  );
  await assert.rejects(
    workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality),
    /Finaliza las tareas/,
  );
  for (const status of ['PAUSED', 'IN_PROGRESS', 'COMPLETED'])
    await workshop.updateTask(f.tenant.id, actor, f.ticket.id, task.id, { status });
  assert.equal(await db.workshopTaskTimeEntry.count({ where: { taskId: task.id } }), 4);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
});

test('tenant ajeno no puede autorizar una orden', async () => {
  const f = await fixture({ count: 1 });
  const other = await db.tenant.create({
    data: { name: 'Otro taller', slug: `other-${randomUUID()}` },
  });
  await sendQuote(f);
  await assert.rejects(
    workshop.respondApproval(other.id, f.user.id, f.ticket.id, {
      ...evidence,
      status: 'APPROVED',
      quoteVersionId: f.ticket.quoteVersions[0].id,
    }),
    /no encontrada/,
  );
});

test('consumo idempotente, devolución sin usar y cancelación conservan stock y ledger', async () => {
  const f = await fixture({ count: 1, stock: 1 });
  await repairing(f);
  const lineId = f.ticket.lines[0].id;
  const payload = { quantity: 1, operationKey: randomUUID() };
  const results = await Promise.all([
    workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'consume', payload),
    workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'consume', payload),
  ]);
  assert.ok(results.every((ticket) => ticket.lines[0].consumedQuantity.eq(1)));
  let product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 0);
  assert.equal(product.reservedStock, 0);
  assert.equal(
    await db.inventoryMovement.count({
      where: { tenantId: f.tenant.id, type: 'WORK_ORDER_CONSUMPTION' },
    }),
    1,
  );
  await assert.rejects(
    workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'CANCELLED' }),
    /Devuelve los repuestos/,
  );
  await assert.rejects(
    workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'consume', {
      ...payload,
      quantity: 2,
    }),
    /clave de operación/,
  );
  await assert.rejects(
    workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'return', {
      quantity: 2,
      operationKey: randomUUID(),
    }),
    /más piezas/,
  );
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'return', {
    quantity: 1,
    operationKey: randomUUID(),
  });
  assert.equal(
    (await db.workshopQualityCheck.findUniqueOrThrow({ where: { ticketId: f.ticket.id } })).status,
    'PENDING',
  );
  product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 1);
  assert.equal(product.reservedStock, 1);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'CANCELLED' });
  product = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(product.stock, 1);
  assert.equal(product.reservedStock, 0);
  assert.equal(await db.inventoryMovement.count({ where: { tenantId: f.tenant.id } }), 4);
});

test('no consume líneas rechazadas, ajenas, fraccionadas ni por encima de la reserva', async () => {
  const f = await fixture();
  await sendQuote(f);
  await approve(f, 'PARTIALLY_APPROVED', [f.ticket.lines[0].id]);
  const move = (lineId, quantity, tenantId = f.tenant.id) =>
    workshop.movePart(tenantId, f.user.id, f.ticket.id, lineId, 'consume', {
      quantity,
      operationKey: randomUUID(),
    });
  await assert.rejects(move(f.ticket.lines[1].id, 1), /repuesto aprobado/);
  await assert.rejects(move('foreign-line', 1), /repuesto aprobado/);
  await assert.rejects(move(f.ticket.lines[0].id, 1, 'foreign-tenant'), /no encontrada/);
  for (const quantity of [0, -1, NaN, Infinity, 0.001, 0.5, 2])
    await assert.rejects(move(f.ticket.lines[0].id, quantity));
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 10);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'IN_PROGRESS' });
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await assert.rejects(
    workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'READY_FOR_DELIVERY' }),
    /entrega de los repuestos/,
  );
});

test('aprobar un adicional no vuelve a reservar repuestos ya entregados', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  await repairing(f);
  await issueAll(f);
  const additional = await workshop.createChangeOrder(
    f.tenant.id,
    f.user.id,
    f.ticket.id,
    additionalPayload(f),
  );
  await workshop.respondChangeOrder(f.tenant.id, f.user.id, f.ticket.id, additional.id, {
    ...evidence,
    status: 'APPROVED',
  });
  const product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 1);
  assert.equal(product.reservedStock, 1);
  const lines = await db.workshopTicketLine.findMany({ where: { ticketId: f.ticket.id } });
  assert.equal(lines.filter((line) => line.consumedQuantity.eq(1)).length, 1);
  assert.equal(
    lines.reduce((sum, line) => sum + line.reservedQuantity, 0),
    1,
  );
});

async function cashierFixture(f) {
  const user = await db.user.create({
    data: { name: 'Cajero de pruebas', email: `${randomUUID()}@example.test` },
  });
  const membership = await db.membership.create({
    data: {
      tenantId: f.tenant.id,
      userId: user.id,
      role: 'CASHIER',
      canUsePos: true,
      canOpenCashSession: true,
      canCloseCashSession: true,
    },
  });
  await db.employeeProfile.create({ data: { tenantId: f.tenant.id, userId: user.id } });
  const register = await db.cashRegister.create({
    data: { tenantId: f.tenant.id, name: 'Caja de pruebas' },
  });
  const cashSession = await new CashService(db).openSession(
    f.tenant.id,
    { ...user, memberships: [membership] },
    { cashRegisterId: register.id, openingAmount: 500 },
  );
  const sequence = await db.fiscalSequence.create({
    data: {
      tenantId: f.tenant.id,
      documentType: 'CONSUMER_02',
      prefix: 'B02',
      startNumber: 1,
      nextNumber: 1,
      endNumber: 10,
    },
  });
  return { user: { ...user, memberships: [membership] }, cashSession, sequence };
}

test('OT → repuesto → Caja → factura B02 y pago → cierre entregado sin descontar dos veces', async () => {
  const f = await fixture({ count: 1, stock: 1 });
  const c = await cashierFixture(f);
  const pos = new PosService(db, {
    sendEcfCopy: () => {
      throw new Error('No external emails in this test');
    },
  });
  await repairing(f);
  await issueAll(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'READY_FOR_DELIVERY',
  });
  const order = await workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {});
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 0);
  const payload = {
    orderId: order.id,
    cashSessionId: c.cashSession.id,
    documentType: 'CONSUMER_02',
    paymentMethod: 'CASH',
    amountReceived: 200,
  };
  await db.cashSession.update({ where: { id: c.cashSession.id }, data: { status: 'CLOSED' } });
  await assert.rejects(pos.completeSale(f.tenant.id, c.user, payload), /open cash session/);
  await db.cashSession.update({ where: { id: c.cashSession.id }, data: { status: 'OPEN' } });
  await assert.rejects(
    pos.completeSale(f.tenant.id, c.user, { ...payload, amountReceived: 10 }),
    /must cover/,
  );
  assert.equal(
    (await db.fiscalSequence.findUniqueOrThrow({ where: { id: c.sequence.id } })).nextNumber,
    1,
  );
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 0);
  const invoice = await pos.completeSale(f.tenant.id, c.user, payload);
  assert.equal(invoice.ncf, 'B0200000001');
  assert.equal(invoice.status, 'PAID');
  assert.equal(invoice.total.toString(), '118');
  assert.equal(invoice.paidAmount.toString(), '118');
  assert.equal(invoice.balance.toString(), '0');
  assert.equal(invoice.changeAmount.toString(), '82');
  assert.equal(invoice.payments.length, 1);
  assert.equal(await db.cashMovement.count({ where: { invoiceId: invoice.id } }), 1);
  const product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 0);
  assert.equal(product.reservedStock, 0);
  assert.equal(
    await db.inventoryMovement.count({ where: { tenantId: f.tenant.id, type: 'SALE' } }),
    0,
  );
  assert.equal(
    await db.inventoryMovement.count({
      where: { invoiceId: invoice.id, type: 'WORK_ORDER_CONSUMPTION' },
    }),
    1,
  );
  await assert.rejects(pos.completeSale(f.tenant.id, c.user, payload));
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 1);
  assert.equal(
    (await db.workshopTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).status,
    'DELIVERED',
  );
  assert.equal(
    await db.workshopTicketStatusEvent.count({
      where: { ticketId: f.ticket.id, toStatus: 'DELIVERED' },
    }),
    1,
  );
});

test('ajustes manuales no fabrican movimientos de OT ni utilizan stock reservado', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  await repairing(f);
  const inventory = new InventoryService(db, new AuditService(db));
  const products = new ProductsService(db, new AuditService(db), { get: () => undefined });
  const payload = { productId: f.products[0].id, type: 'ADJUSTMENT_OUT', quantity: 2 };
  await assert.rejects(inventory.createMovement(f.tenant.id, f.user.id, payload), /reservadas/);
  for (const type of [
    'WORK_ORDER_CONSUMPTION',
    'WORK_ORDER_RESERVATION',
    'WORK_ORDER_RETURN',
    'WORK_ORDER_RELEASE',
  ]) {
    await assert.rejects(
      inventory.createMovement(f.tenant.id, f.user.id, { ...payload, type }),
      /desde la OT/,
    );
  }
  await assert.rejects(
    products.update(f.tenant.id, f.user.id, f.products[0].id, { stock: 0 }),
    /cantidades reservadas/,
  );
  await assert.rejects(
    products.update(f.tenant.id, f.user.id, f.products[0].id, { trackInventory: false }),
    /reparación abierta/,
  );
  await issueAll(f);
  await assert.rejects(
    products.update(f.tenant.id, f.user.id, f.products[0].id, { trackInventory: false }),
    /reparación abierta/,
  );
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 1);
});

test('un ajuste concurrente con entrega al mecánico conserva ambos movimientos', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  await repairing(f);
  const inventory = new InventoryService(db, new AuditService(db));
  await Promise.all([
    inventory.createMovement(f.tenant.id, f.user.id, {
      productId: f.products[0].id,
      type: 'ADJUSTMENT_IN',
      quantity: 3,
    }),
    workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, f.ticket.lines[0].id, 'consume', {
      quantity: 1,
      operationKey: randomUUID(),
    }),
  ]);
  const product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 4);
  assert.equal(product.reservedStock, 0);
  const movements = await db.inventoryMovement.findMany({
    where: { tenantId: f.tenant.id, type: { not: 'WORK_ORDER_RESERVATION' } },
  });
  assert.equal(
    movements.reduce((sum, item) => sum + item.newStock - item.previousStock, 0),
    2,
  );
});

test('consumo fraccionado en unidades permitidas conserva saldo exacto por línea', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  await db.product.update({ where: { id: f.products[0].id }, data: { unit: 'METER' } });
  await repairing(f);
  for (const quantity of [0.25, 0.25, 0.5]) {
    await workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, f.ticket.lines[0].id, 'consume', {
      quantity,
      operationKey: randomUUID(),
    });
  }
  const line = await db.workshopTicketLine.findUniqueOrThrow({
    where: { id: f.ticket.lines[0].id },
  });
  assert.equal(line.consumedQuantity.toString(), '1');
  assert.equal(line.reservedQuantity, 0);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 1);
});

test('piezas devueltas y liberadas no se cobran y el presupuesto original se conserva', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    lines: [
      {
        type: 'PART',
        productId: f.products[0].id,
        description: 'Dos repuestos autorizados',
        quantity: 2,
        unitPrice: 100,
      },
    ],
  });
  await repairing(f);
  await issueAll(f);
  const lineId = f.ticket.lines[0].id;
  const release = {
    quantity: 1,
    operationKey: randomUUID(),
    note: 'Solo se necesitó instalar una unidad.',
  };
  await assert.rejects(
    workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'release', release),
    /Devuelve primero/,
  );
  await workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'return', {
    quantity: 1,
    operationKey: randomUUID(),
  });
  await assert.rejects(
    workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'release', {
      ...release,
      note: '',
    }),
    /por qué/,
  );
  let updated = await workshop.movePart(
    f.tenant.id,
    f.user.id,
    f.ticket.id,
    lineId,
    'release',
    release,
  );
  assert.equal(updated.total.toString(), '100');
  assert.equal(updated.quoteVersions[0].total.toString(), '200');
  assert.equal(updated.quoteVersions[0].snapshot.lines[0].quantity, '2.00');
  assert.equal(updated.lines[0].quantity.toString(), '2');
  assert.equal(updated.lines[0].consumedQuantity.toString(), '1');
  assert.equal(updated.lines[0].releasedQuantity.toString(), '1');
  assert.equal(updated.lines[0].reservedQuantity, 0);
  await workshop.movePart(f.tenant.id, f.user.id, f.ticket.id, lineId, 'release', release);
  const c = await cashierFixture(f);
  const pos = new PosService(db, {
    sendEcfCopy: () => {
      throw new Error('No email expected');
    },
  });
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'READY_FOR_DELIVERY',
  });
  const order = await workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {});
  const invoice = await pos.completeSale(f.tenant.id, c.user, {
    orderId: order.id,
    cashSessionId: c.cashSession.id,
    paymentMethod: 'CARD',
    amountReceived: 118,
  });
  assert.equal(invoice.total.toString(), '118');
  assert.equal(invoice.items[0].quantity.toString(), '1');
  const product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 1);
  assert.equal(product.reservedStock, 0);
  assert.equal(
    await db.inventoryMovement.count({
      where: { tenantId: f.tenant.id, type: 'WORK_ORDER_RELEASE' },
    }),
    1,
  );
});

test('una orden tradicional sin consumo previo sigue descontando inventario al cobrar', async () => {
  const f = await fixture({ count: 1, stock: 1 });
  const c = await cashierFixture(f);
  const pos = new PosService(db, {
    sendEcfCopy: () => {
      throw new Error('No email expected');
    },
  });
  await db.product.update({ where: { id: f.products[0].id }, data: { reservedStock: 1 } });
  const order = await db.salesOrder.create({
    data: {
      tenantId: f.tenant.id,
      customerId: f.customer.id,
      createdById: f.user.id,
      orderNumber: 'MOSTRADOR-TEST',
      status: 'SENT_TO_CASHIER',
      subtotal: 100,
      taxTotal: 18,
      total: 118,
      items: {
        create: [
          {
            productId: f.products[0].id,
            description: 'Repuesto de mostrador',
            quantity: 1,
            reservedQuantity: 1,
            unitPrice: 100,
            taxRate: 0.18,
            taxTotal: 18,
            subtotal: 100,
            total: 118,
          },
        ],
      },
    },
  });
  const invoice = await pos.completeSale(f.tenant.id, c.user, {
    orderId: order.id,
    paymentMethod: 'TRANSFER',
    amountReceived: 118,
  });
  const product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 0);
  assert.equal(product.reservedStock, 0);
  assert.equal(
    await db.inventoryMovement.count({ where: { invoiceId: invoice.id, type: 'SALE' } }),
    1,
  );
});

function directSale(f, c, overrides = {}) {
  return {
    checkoutKey: randomUUID(),
    cashSessionId: c.cashSession.id,
    documentType: 'CONSUMER_02',
    paymentMethod: 'CASH',
    amountReceived: 118,
    items: [{ productId: f.products[0].id, quantity: 1 }],
    ...overrides,
  };
}

test('venta directa con tres medios registra cada pago, devuelta y cierre solo en efectivo', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  const c = await cashierFixture(f);
  const pos = new PosService(db, {});
  const payload = directSale(f, c, {
    paymentMethod: undefined,
    amountReceived: undefined,
    payments: [
      { method: 'CASH', amount: 18, amountReceived: 50 },
      { method: 'CARD', amount: 60, reference: 'VOUCHER-1' },
      { method: 'TRANSFER', amount: 40, reference: 'TRANSFER-1' },
    ],
  });
  const invoice = await pos.completeSale(f.tenant.id, c.user, payload);
  assert.equal(invoice.status, 'PAID');
  assert.equal(invoice.total.toString(), '118');
  assert.equal(invoice.amountReceived.toString(), '150');
  assert.equal(invoice.changeAmount.toString(), '32');
  assert.equal(invoice.paymentMethod, null);
  assert.equal(invoice.payments.length, 3);
  assert.equal(
    invoice.payments.find((payment) => payment.method === 'TRANSFER').reference,
    'TRANSFER-1',
  );
  assert.equal(await db.salesOrder.count({ where: { tenantId: f.tenant.id } }), 0);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 1);
  const closed = await new CashService(db).closeSession(f.tenant.id, c.user, c.cashSession.id, {
    closingAmount: 518,
  });
  assert.equal(closed.expectedAmount.toString(), '518');
  assert.equal(closed.difference.toString(), '0');
  const retry = await pos.completeSale(f.tenant.id, c.user, payload);
  assert.equal(retry.id, invoice.id);
  assert.equal(await db.payment.count({ where: { invoiceId: invoice.id } }), 3);
});

test('dos cobros directos concurrentes con la misma clave crean una sola factura', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  const c = await cashierFixture(f);
  const pos = new PosService(db, {});
  const payload = directSale(f, c);
  const results = await Promise.all([
    pos.completeSale(f.tenant.id, c.user, payload),
    pos.completeSale(f.tenant.id, c.user, payload),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 1);
  assert.equal(
    (await db.fiscalSequence.findUniqueOrThrow({ where: { id: c.sequence.id } })).nextNumber,
    2,
  );
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 1);
  await assert.rejects(
    pos.completeSale(f.tenant.id, c.user, { ...payload, amountReceived: 200 }),
    /otro cobro/,
  );
});

test('pagos incompletos, excesivos, inválidos o ambiguos revierten factura, stock y secuencia', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  const c = await cashierFixture(f);
  const pos = new PosService(db, {});
  const invalid = [
    [{ method: 'CARD', amount: 117 }],
    [{ method: 'CARD', amount: 119 }],
    [{ method: 'CARD', amount: 118, amountReceived: 120 }],
    [
      { method: 'CASH', amount: 18 },
      { method: 'CASH', amount: 100 },
    ],
    [
      { method: 'CARD', amount: 0 },
      { method: 'CARD', amount: 118 },
    ],
    [{ method: 'CREDIT', amount: 118 }],
    [{ method: 'CHECK', amount: 118 }],
    [{ method: 'OTHER', amount: 118 }],
    [{ method: 'CASH', amount: 118, amountReceived: 10 }],
    [{ method: 'CARD', amount: 118.001 }],
    [{ method: 'CARD', amount: -118 }],
    [{ method: 'CARD', amount: NaN }],
    [],
  ];
  for (const payments of invalid)
    await assert.rejects(
      pos.completeSale(
        f.tenant.id,
        c.user,
        directSale(f, c, { paymentMethod: undefined, amountReceived: undefined, payments }),
      ),
    );
  await assert.rejects(
    pos.completeSale(
      f.tenant.id,
      c.user,
      directSale(f, c, { payments: [{ method: 'CARD', amount: 118 }] }),
    ),
    /no ambos/,
  );
  await assert.rejects(
    pos.completeSale(f.tenant.id, c.user, directSale(f, c, { checkoutKey: undefined })),
    /clave de cobro/,
  );
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 0);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 2);
  assert.equal(
    (await db.fiscalSequence.findUniqueOrThrow({ where: { id: c.sequence.id } })).nextNumber,
    1,
  );
});

test('venta directa respeta reservas de OT y permisos de usuario y empresa', async () => {
  const f = await fixture({ count: 1, stock: 1 });
  const c = await cashierFixture(f);
  const pos = new PosService(db, {});
  await repairing(f);
  const payload = directSale(f, c);
  await assert.rejects(pos.completeSale(f.tenant.id, c.user, payload), /Insufficient/);
  await assert.rejects(
    pos.completeSale('foreign-tenant', c.user, payload),
    (error) => error.getStatus() === 403,
  );
  await assert.rejects(
    pos.completeSale(
      f.tenant.id,
      {
        ...c.user,
        memberships: [{ ...c.user.memberships[0], role: 'MECHANIC', canUsePos: false }],
      },
      payload,
    ),
    (error) => error.getStatus() === 403,
  );
  await assert.rejects(
    pos.completeSale(
      f.tenant.id,
      { ...c.user, memberships: [{ ...c.user.memberships[0], status: 'INACTIVE' }] },
      payload,
    ),
    (error) => error.getStatus() === 403,
  );
  await db.product.update({ where: { id: f.products[0].id }, data: { stock: 2 } });
  await pos.completeSale(f.tenant.id, c.user, payload);
  const product = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(product.stock, 1);
  assert.equal(product.reservedStock, 1);
});

test('POS electrónico usa pagos desglosados en XML y copia sin simular envío externo', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  const c = await cashierFixture(f);
  await db.fiscalSequence.create({
    data: {
      tenantId: f.tenant.id,
      documentType: 'CONSUMER_ELECTRONIC_32',
      prefix: 'E32',
      startNumber: 1,
      nextNumber: 1,
      endNumber: 10,
    },
  });
  const copies = [];
  const pos = new PosService(db, {
    sendEcfCopy: async (payload) => {
      copies.push(payload);
    },
  });
  const payload = directSale(f, c, {
    documentType: 'CONSUMER_ELECTRONIC_32',
    electronicInvoiceRequested: true,
    ecfRecipientEmail: 'cliente@example.test',
    paymentMethod: undefined,
    amountReceived: undefined,
    payments: [
      { method: 'CARD', amount: 50 },
      { method: 'TRANSFER', amount: 68 },
    ],
  });
  const invoice = await pos.completeSale(f.tenant.id, c.user, payload);
  const xml = invoice.electronicDocument.requestPayload.xml;
  assert.match(xml, /<FormaPago>3<\/FormaPago><MontoPago>50.00<\/MontoPago>/);
  assert.match(xml, /<FormaPago>2<\/FormaPago><MontoPago>68.00<\/MontoPago>/);
  assert.equal(invoice.eNcf, 'E320000000001');
  assert.equal(invoice.fiscalStatus, 'PENDING_SIGNATURE');
  assert.equal(copies.length, 1);
  assert.ok(copies[0].recipients.includes('cliente@example.test'));
  assert.match(copies[0].templateVariables.PAYMENT_METHOD, /Tarjeta: RD\$50.00/);
  await pos.completeSale(f.tenant.id, c.user, payload);
  assert.equal(copies.length, 1);
});

test('cheques/otros requieren referencia y una inicial puede dividirse sin marcar la deuda pagada', () => {
  const payment = buildPaymentPlan(new Prisma.Decimal(20), {
    payments: [
      { method: 'CASH', amount: 5, amountReceived: 10 },
      { method: 'CHECK', amount: 10, reference: 'CH-123' },
      { method: 'OTHER', amount: 5, reference: 'Otro medio documentado' },
    ],
  });
  assert.equal(payment.paidAmount.toString(), '20');
  assert.equal(payment.changeAmount.toString(), '5');
  assert.equal(new Prisma.Decimal(100).sub(payment.paidAmount).toString(), '80');
  assert.throws(
    () => buildPaymentPlan(new Prisma.Decimal(20), { payments: [{ method: 'CHECK', amount: 20 }] }),
    /referencia/,
  );
  assert.throws(
    () => buildPaymentPlan(new Prisma.Decimal(0), { paymentMethod: 'CASH', amountReceived: 10 }),
    /inicial es cero/,
  );
});

test('dos cierres simultáneos no duplican el movimiento de cierre', async () => {
  const f = await fixture({ count: 1 });
  const c = await cashierFixture(f);
  const cash = new CashService(db);
  const results = await Promise.allSettled([
    cash.closeSession(f.tenant.id, c.user, c.cashSession.id, { closingAmount: 500 }),
    cash.closeSession(f.tenant.id, c.user, c.cashSession.id, { closingAmount: 500 }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    await db.cashMovement.count({ where: { cashSessionId: c.cashSession.id, type: 'CLOSING' } }),
    1,
  );
});

test('venta directa concurrente con cierre no ingresa pagos a una caja ya cerrada', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  const c = await cashierFixture(f);
  const pos = new PosService(db, {});
  const cash = new CashService(db);
  const results = await Promise.allSettled([
    pos.completeSale(f.tenant.id, c.user, directSale(f, c)),
    cash.closeSession(f.tenant.id, c.user, c.cashSession.id, { closingAmount: 500 }),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  const paid = await db.payment.aggregate({
    where: { cashSessionId: c.cashSession.id, status: 'COMPLETED', method: 'CASH' },
    _sum: { amount: true },
  });
  const closed = await db.cashSession.findUniqueOrThrow({ where: { id: c.cashSession.id } });
  assert.equal(
    closed.expectedAmount.toString(),
    new Prisma.Decimal(500).add(paid._sum.amount ?? 0).toString(),
  );
  assert.equal(closed.status, 'CLOSED');
  await assert.rejects(
    pos.completeSale(f.tenant.id, c.user, directSale(f, c)),
    /open cash session/,
  );
});

test('apertura simultánea de una misma caja o usuario admite una sola sesión', async () => {
  const f = await fixture({ count: 1 });
  const c = await cashierFixture(f);
  const cash = new CashService(db);
  await cash.closeSession(f.tenant.id, c.user, c.cashSession.id, { closingAmount: 500 });
  const payload = { cashRegisterId: c.cashSession.cashRegisterId, openingAmount: 0 };
  const results = await Promise.allSettled([
    cash.openSession(f.tenant.id, c.user, payload),
    cash.openSession(f.tenant.id, c.user, payload),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(await db.cashSession.count({ where: { tenantId: f.tenant.id, status: 'OPEN' } }), 1);
});

async function mechanicFixture(f) {
  const user = await db.user.create({
    data: {
      name: 'Técnico de prueba',
      email: `${randomUUID()}@example.test`,
      memberships: { create: { tenantId: f.tenant.id, role: 'MECHANIC' } },
    },
  });
  const employee = await db.employeeProfile.create({
    data: { tenantId: f.tenant.id, userId: user.id },
  });
  return {
    employee,
    actor: { id: user.id, memberships: [{ tenantId: f.tenant.id, role: 'MECHANIC' }] },
  };
}

function advisorActor(f) {
  return { id: f.user.id, memberships: [{ tenantId: f.tenant.id, role: 'ORDER_TAKER' }] };
}

async function addLabor(f) {
  const service = await workshop.createService(f.tenant.id, f.user.id, {
    code: 'LAB-TEST',
    name: 'Instalación autorizada',
    defaultPrice: 300,
    estimatedMinutes: 45,
  });
  f.ticket = await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    lines: [
      ...f.ticket.lines.map((line) => ({
        productId: line.productId,
        type: line.type,
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      })),
      {
        serviceId: service.id,
        type: 'LABOR',
        description: service.name,
        quantity: 1,
        unitPrice: 300,
      },
    ],
  });
  return service;
}

test('una tarea de reparación exige línea autorizada de la misma OT y empresa', async () => {
  const f = await fixture();
  const other = await fixture();
  const m = await mechanicFixture(f);
  const input = {
    kind: 'REPAIR',
    ticketLineId: f.ticket.lines[0].id,
    title: 'Instalar',
    employeeId: m.employee.id,
  };
  await assert.rejects(
    workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, input),
    /línea aprobada/,
  );
  await sendQuote(f);
  await approve(f, 'PARTIALLY_APPROVED', [f.ticket.lines[0].id]);
  for (const ticketLineId of [
    f.ticket.lines.find((line) => line.approvalStatus === 'REJECTED').id,
    other.ticket.lines[0].id,
    'missing',
  ]) {
    await assert.rejects(
      workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, { ...input, ticketLineId }),
      /línea aprobada/,
    );
  }
  await assert.rejects(
    workshop.createTask(other.tenant.id, other.user.id, f.ticket.id, input),
    /no encontrada/,
  );
  await assert.rejects(
    workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, { ...input, kind: undefined }),
    /Clasifica/,
  );
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, input);
  await assert.rejects(
    workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' }),
    /Inicia la reparación/,
  );
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'IN_PROGRESS' });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  assert.equal(await db.workshopTask.count({ where: { ticketId: f.ticket.id } }), 1);
  await assert.rejects(
    db.workshopTask.create({
      data: {
        ticketId: f.ticket.id,
        kind: 'REPAIR',
        ticketLineId: other.ticket.lines[0].id,
        title: 'Vínculo cruzado',
      },
    }),
    /Foreign key constraint/,
  );
  await assert.rejects(
    db.workshopTask.create({
      data: { ticketId: f.ticket.id, kind: 'REPAIR', title: 'Sin vínculo' },
    }),
  );
});

test('diagnóstico previo sin cobro debe terminar antes de solicitar aprobación', async () => {
  const f = await fixture({ count: 1 });
  const m = await mechanicFixture(f);
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'DIAGNOSIS',
    title: 'Inspeccionar frenos',
    employeeId: m.employee.id,
  });
  await assert.rejects(
    workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' }),
    /durante el diagnóstico/,
  );
  await workshop.createReception(f.tenant.id, f.user.id, f.ticket.id, { mileage: 1000 });
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'DIAGNOSIS' });
  await workshop.saveInspection(f.tenant.id, f.user.id, f.ticket.id, {
    items: [{ code: 'BRAKES', label: 'Frenos', result: 'REQUIRES_REPAIR' }],
  });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  await assert.rejects(
    workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'AWAITING_APPROVAL' }),
    /Finaliza las tareas de diagnóstico/,
  );
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'COMPLETED' });
  const quoted = await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'AWAITING_APPROVAL',
  });
  assert.equal(quoted.total.toString(), '100');
  assert.equal(await db.inventoryMovement.count({ where: { tenantId: f.tenant.id } }), 0);
  await assert.rejects(
    workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
      kind: 'DIAGNOSIS',
      title: 'Reparación disfrazada',
    }),
    /recepción o diagnóstico/,
  );
});

test('calidad exige mano de obra ejecutada y múltiples técnicos no duplican la factura', async () => {
  const f = await fixture({ count: 1 });
  const service = await addLabor(f);
  await repairing(f);
  await issueAll(f);
  const line = f.ticket.lines.find((item) => item.type === 'LABOR');
  await assert.rejects(
    workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality),
    /Falta registrar y completar/,
  );
  const first = await mechanicFixture(f);
  const second = await mechanicFixture(f);
  const task1 = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'REPAIR',
    ticketLineId: line.id,
    title: 'Desmontar',
    employeeId: first.employee.id,
  });
  const task2 = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'REPAIR',
    ticketLineId: line.id,
    title: 'Montar',
    employeeId: second.employee.id,
  });
  for (const [task, m] of [
    [task1, first],
    [task2, second],
  ]) {
    await assert.rejects(
      workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality),
      /Finaliza las tareas/,
    );
    for (const status of ['IN_PROGRESS', 'COMPLETED'])
      await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status });
  }
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'READY_FOR_DELIVERY',
  });
  const prepared = await workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {});
  const order = await db.salesOrder.findUniqueOrThrow({
    where: { id: prepared.id },
    include: { items: true },
  });
  assert.equal(order.items.filter((item) => item.productId === service.productId).length, 1);
  assert.equal(order.items.length, 2);
  const c = await cashierFixture(f);
  const invoice = await new PosService(db, {}).completeSale(f.tenant.id, c.user, {
    orderId: order.id,
    cashSessionId: c.cashSession.id,
    documentType: 'CONSUMER_02',
    paymentMethod: 'CASH',
    amountReceived: Number(order.total),
  });
  assert.equal(invoice.items.filter((item) => item.productId === service.productId).length, 1);
  assert.equal(invoice.status, 'PAID');
  assert.equal(
    Number((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock),
    9,
  );
});

test('cancelar tareas conserva tiempo y no declara ejecutado un servicio aprobado', async () => {
  const f = await fixture({ count: 1 });
  await addLabor(f);
  await repairing(f);
  const m = await mechanicFixture(f);
  const line = f.ticket.lines.find((item) => item.type === 'LABOR');
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'REPAIR',
    ticketLineId: line.id,
    title: 'Instalar',
    employeeId: m.employee.id,
  });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  await db.workshopTaskTimeEntry.updateMany({
    where: { taskId: task.id, event: 'START' },
    data: { occurredAt: new Date(Date.now() - 12 * 60000) },
  });
  await assert.rejects(
    workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'CANCELLED' }),
    /corresponde al asesor/,
  );
  await assert.rejects(
    workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, task.id, {
      status: 'CANCELLED',
    }),
    /motivo/,
  );
  const payload = {
    status: 'CANCELLED',
    cancellationReason: 'El técnico no podrá continuar; reasignar.',
  };
  const cancelled = await workshop.updateTask(
    f.tenant.id,
    advisorActor(f),
    f.ticket.id,
    task.id,
    payload,
  );
  assert.equal(cancelled.actualMinutes, 12);
  await workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, task.id, payload);
  assert.equal(
    await db.workshopTaskTimeEntry.count({ where: { taskId: task.id, event: 'CANCEL' } }),
    1,
  );
  await assert.rejects(
    workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality),
    /Falta registrar y completar/,
  );
  await assert.rejects(
    workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, task.id, {
      title: 'Otro trabajo',
    }),
    /histórico/,
  );
});

test('tareas históricas no heredan autorización: clasificar pendientes y conservar las iniciadas', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  const m = await mechanicFixture(f);
  const task = await db.workshopTask.create({
    data: { ticketId: f.ticket.id, title: 'Tarea anterior', employeeId: m.employee.id },
  });
  assert.equal(task.kind, 'LEGACY');
  await assert.rejects(
    workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' }),
    /Clasifica/,
  );
  await workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, task.id, {
    kind: 'REPAIR',
    ticketLineId: f.ticket.lines[0].id,
  });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  await assert.rejects(
    workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, task.id, { kind: 'DIAGNOSIS' }),
    /alcance definido/,
  );
  await assert.rejects(
    workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, task.id, { actualMinutes: 900 }),
    /no se editan/,
  );
  const other = await mechanicFixture(f);
  await assert.rejects(
    workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, task.id, {
      employeeId: other.employee.id,
    }),
    /conserva su alcance y técnico/,
  );
  const historical = await db.workshopTask.create({
    data: {
      ticketId: f.ticket.id,
      title: 'Trabajo histórico sin eventos',
      employeeId: m.employee.id,
      status: 'PAUSED',
      startedAt: new Date(Date.now() - 600000),
      actualMinutes: 7,
    },
  });
  await assert.rejects(
    workshop.updateTask(f.tenant.id, advisorActor(f), f.ticket.id, historical.id, {
      kind: 'REPAIR',
      ticketLineId: f.ticket.lines[0].id,
    }),
    /conserva su alcance y técnico/,
  );
  const cancelled = await workshop.updateTask(
    f.tenant.id,
    advisorActor(f),
    f.ticket.id,
    historical.id,
    { status: 'CANCELLED', cancellationReason: 'Revisar alcance histórico antes de continuar.' },
  );
  assert.equal(cancelled.actualMinutes, 7);
  assert.equal(cancelled.pausedMinutes, 0);
  assert.equal(cancelled.kind, 'LEGACY');
});

test('abandonar una OT cierra también el tiempo de tareas activas sin borrarlas', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  const m = await mechanicFixture(f);
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'REPAIR',
    ticketLineId: f.ticket.lines[0].id,
    title: 'Instalación',
    employeeId: m.employee.id,
  });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, { status: 'CANCELLED' });
  const ended = await db.workshopTask.findUniqueOrThrow({
    where: { id: task.id },
    include: { timeEntries: true },
  });
  assert.equal(ended.status, 'CANCELLED');
  assert.equal(
    ended.timeEntries.find((entry) => entry.event === 'CANCEL').note,
    'Orden de trabajo cancelada.',
  );
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 10);
});

test('tiempo trabajado y pausado se calculan por eventos, incluyendo cancelación y pausa abierta', () => {
  const origin = new Date('2026-09-06T10:00:00Z');
  const at = (minute) => new Date(+origin + minute * 60000);
  const event = (name, minute) => ({ event: name, occurredAt: at(minute) });
  const entries = [event('START', 0), event('PAUSE', 12), event('RESUME', 17), event('PAUSE', 24)];
  const totals = (status, extra = []) =>
    taskTimeTotals([...entries, ...extra], { now: at(30), startedAt: origin, status });
  assert.deepEqual(totals('PAUSED'), { actualMinutes: 19, pausedMinutes: 11 });
  assert.deepEqual(totals('COMPLETED', [event('COMPLETE', 28)]), {
    actualMinutes: 19,
    pausedMinutes: 9,
  });
  assert.deepEqual(totals('CANCELLED', [event('CANCEL', 28)]), {
    actualMinutes: 19,
    pausedMinutes: 9,
  });
  assert.deepEqual(
    taskTimeTotals([event('START', 0), event('CANCEL', 5)], {
      now: at(30),
      startedAt: origin,
      status: 'CANCELLED',
    }),
    { actualMinutes: 5, pausedMinutes: 0 },
  );
});

test('fallo de auditoría revierte tarea, eventos y cambio de calidad en la misma transacción', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  await issueAll(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  const m = await mechanicFixture(f);
  const input = {
    kind: 'REPAIR',
    ticketLineId: f.ticket.lines[0].id,
    title: 'Revisión autorizada',
    employeeId: m.employee.id,
  };
  const failing = new WorkshopService(db, {
    log: async () => {
      throw new Error('Audit unavailable');
    },
  });
  await assert.rejects(
    failing.createTask(f.tenant.id, f.user.id, f.ticket.id, input),
    /Audit unavailable/,
  );
  assert.equal(await db.workshopTask.count({ where: { ticketId: f.ticket.id } }), 0);
  assert.equal(
    (await db.workshopQualityCheck.findUniqueOrThrow({ where: { ticketId: f.ticket.id } })).status,
    'APPROVED',
  );
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, input);
  await assert.rejects(
    failing.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' }),
    /Audit unavailable/,
  );
  assert.equal(
    (await db.workshopTask.findUniqueOrThrow({ where: { id: task.id } })).status,
    'PENDING',
  );
  assert.equal(await db.workshopTaskTimeEntry.count({ where: { taskId: task.id } }), 0);
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  const log = await db.auditLog.findFirstOrThrow({
    where: { entityId: task.id, action: 'WORKSHOP_TASK_UPDATED' },
  });
  assert.equal(log.metadata.previous.status, 'PENDING');
  assert.equal(log.metadata.next.status, 'IN_PROGRESS');
  assert.equal(log.metadata.next.ticketLineId, f.ticket.lines[0].id);
});

test('los minutos de pausa y trabajo sobreviven la recarga desde PostgreSQL', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  const m = await mechanicFixture(f);
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'REPAIR',
    ticketLineId: f.ticket.lines[0].id,
    title: 'Instalar',
    employeeId: m.employee.id,
  });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  await db.workshopTaskTimeEntry.updateMany({
    where: { taskId: task.id, event: 'START' },
    data: { occurredAt: new Date(Date.now() - 18 * 60000) },
  });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'PAUSED' });
  await db.workshopTaskTimeEntry.updateMany({
    where: { taskId: task.id, event: 'PAUSE' },
    data: { occurredAt: new Date(Date.now() - 5 * 60000) },
  });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'IN_PROGRESS' });
  await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status: 'COMPLETED' });
  const stored = await db.workshopTask.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(stored.actualMinutes, 13);
  assert.equal(stored.pausedMinutes, 5);
});

test('mano de obra adicional aprobada requiere ejecución y vuelve a bloquear calidad', async () => {
  const f = await fixture({ count: 1 });
  await repairing(f);
  await issueAll(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  const service = await workshop.createService(f.tenant.id, f.user.id, {
    code: 'EXT-LAB',
    name: 'Reparación adicional',
    defaultPrice: 50,
  });
  const change = await workshop.createChangeOrder(f.tenant.id, f.user.id, f.ticket.id, {
    title: 'Hallazgo',
    lines: [
      {
        type: 'LABOR',
        serviceId: service.id,
        description: service.name,
        quantity: 1,
        unitPrice: 50,
      },
    ],
  });
  const m = await mechanicFixture(f);
  await assert.rejects(
    workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
      kind: 'REPAIR',
      ticketLineId: change.lines[0].id,
      title: 'Ejecutar adicional',
      employeeId: m.employee.id,
    }),
    /línea aprobada/,
  );
  await workshop.respondChangeOrder(f.tenant.id, f.user.id, f.ticket.id, change.id, {
    ...evidence,
    status: 'APPROVED',
  });
  const line = await db.workshopTicketLine.findFirstOrThrow({
    where: { ticketId: f.ticket.id, serviceId: service.id },
  });
  await assert.rejects(
    workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality),
    /Falta registrar y completar/,
  );
  const task = await workshop.createTask(f.tenant.id, f.user.id, f.ticket.id, {
    kind: 'REPAIR',
    ticketLineId: line.id,
    title: 'Ejecutar adicional',
    employeeId: m.employee.id,
  });
  for (const status of ['IN_PROGRESS', 'COMPLETED'])
    await workshop.updateTask(f.tenant.id, m.actor, f.ticket.id, task.id, { status });
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  assert.equal(
    await db.workshopTicketLine.count({ where: { ticketId: f.ticket.id, serviceId: service.id } }),
    1,
  );
});

test('enviar a Caja revierte todo si falla auditoría y no genera pagos ni consume secuencia', async () => {
  const f = await fixture({ count: 1 });
  const c = await cashierFixture(f);
  await repairing(f);
  await issueAll(f);
  await workshop.saveQualityCheck(f.tenant.id, f.user.id, f.ticket.id, quality);
  await workshop.updateTicket(f.tenant.id, f.user.id, f.ticket.id, {
    status: 'READY_FOR_DELIVERY',
  });
  const failing = new WorkshopService(db, {
    log: async () => {
      throw new Error('audit-transfer-failure');
    },
  });
  await assert.rejects(
    failing.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {}),
    /audit-transfer-failure/,
  );
  assert.equal(
    (await db.workshopTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).salesOrderId,
    null,
  );
  assert.equal(await db.salesOrder.count({ where: { tenantId: f.tenant.id } }), 0);
  await workshop.sendToCashier(f.tenant.id, f.user.id, f.ticket.id, {});
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 0);
  assert.equal(await db.payment.count({ where: { tenantId: f.tenant.id } }), 0);
  assert.equal(
    (await db.fiscalSequence.findUniqueOrThrow({ where: { id: c.sequence.id } })).nextNumber,
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { tenantId: f.tenant.id, action: 'WORKSHOP_TICKET_SENT_TO_CASHIER' },
    }),
    1,
  );
});

test('permisos distinguen preparar cobro, cobrar, calidad y entregar; las denegaciones se respetan', () => {
  const actor = (role, overrides = {}) => ({
    id: 'user',
    status: 'ACTIVE',
    memberships: [{ tenantId: 'tenant', status: 'ACTIVE', role, permissionOverrides: overrides }],
  });
  const guard = new RolesGuard(new Reflector());
  const can = (method, user) =>
    guard.canActivate({
      getHandler: () => WorkshopController.prototype[method],
      getClass: () => WorkshopController,
      switchToHttp: () => ({ getRequest: () => ({ tenantId: 'tenant', user }) }),
    });
  assert.equal(can('sendToCashier', actor('SERVICE_ADVISOR')), true);
  assert.equal(can('saveQualityCheck', actor('SUPERVISOR')), true);
  for (const role of ['CASHIER', 'MECHANIC', 'RECEPTIONIST'])
    assert.throws(() => can('sendToCashier', actor(role)), /permiso/);
  assert.throws(
    () => can('sendToCashier', actor('ADMIN', { 'workorders.send_to_cashier': false })),
    /permiso/,
  );
  assert.throws(() => can('saveQualityCheck', actor('SERVICE_ADVISOR')), /permiso/);
  assert.equal(effectivePermissions({ role: 'CASHIER' })['pos.sell'], true);
  assert.equal(effectivePermissions({ role: 'SERVICE_ADVISOR' })['pos.sell'], false);
  assert.equal(effectivePermissions({ role: 'ADMIN' })['pos.sell'], false);
  assert.throws(() => can('sendToCashier', { ...actor('ADMIN'), status: 'BLOCKED' }), /permiso/);
  assert.throws(
    () =>
      can('sendToCashier', {
        ...actor('ADMIN'),
        memberships: [{ tenantId: 'foreign', status: 'ACTIVE', role: 'ADMIN' }],
      }),
    /permiso/,
  );
  const controller = new WorkshopController({
    updateTicket: () => {
      throw new Error('must-not-reach-service');
    },
  });
  assert.throws(
    () =>
      controller.updateTicket('tenant', actor('SUPERVISOR'), 'ticket', {
        status: 'AWAITING_APPROVAL',
      }),
    /permiso/,
  );
});

test('quitar permiso de cobrar impide POS y toma de orden incluso con rol cajero', async () => {
  const f = await fixture({ count: 1 });
  const c = await cashierFixture(f);
  const user = {
    ...c.user,
    memberships: [
      { ...c.user.memberships[0], permissionOverrides: { 'pos.sell': false, 'cash.close': false } },
    ],
  };
  await assert.rejects(
    new PosService(db, {}).completeSale(f.tenant.id, user, {
      checkoutKey: randomUUID(),
      items: [{ productId: f.products[0].id, quantity: 1 }],
      amountReceived: 100,
    }),
    /permiso/,
  );
  await assert.rejects(
    new OrdersService(db).claim(f.tenant.id, user, 'unused-order', {
      cashSessionId: c.cashSession.id,
    }),
    /permiso/,
  );
  await assert.rejects(
    new CashService(db).closeSession(f.tenant.id, user, c.cashSession.id, { closingAmount: 500 }),
    /permiso/,
  );
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 0);
});

async function employeeAdminFixture() {
  const f = await fixture({ count: 1 });
  const membership = await db.membership.create({
    data: { tenantId: f.tenant.id, userId: f.user.id, role: 'ADMIN' },
  });
  const profile = await db.employeeProfile.create({
    data: { tenantId: f.tenant.id, userId: f.user.id },
  });
  return { ...f, actor: { ...f.user, memberships: [membership] }, profile };
}

test('límite de cinco usuarios conserva roles del taller y no hereda permisos al cambiar de rol', async () => {
  const f = await employeeAdminFixture();
  const employees = new EmployeesService(db);
  let latest;
  for (const role of ['ORDER_TAKER', 'ORDER_TAKER', 'ORDER_TAKER', 'ORDER_TAKER']) {
    latest = await employees.create(f.tenant.id, f.actor, {
      name: 'Empleado de pruebas',
      email: `${randomUUID()}@example.test`,
      password: 'Integration-only-123!',
      role,
    });
    assert.equal(latest.user.memberships[0].role, role);
  }
  assert.equal(await db.employeeProfile.count({ where: { tenantId: f.tenant.id } }), 5);
  assert.deepEqual(await employees.userLimit(f.tenant.id), {
    limit: 5,
    used: 5,
    available: 0,
    mechanics: 0,
  });
  await assert.rejects(
    employees.create(f.tenant.id, f.actor, {
      name: 'Sexto usuario',
      email: `${randomUUID()}@example.test`,
      password: 'Integration-only-123!',
      role: 'ORDER_TAKER',
    }),
    /máximo de 5/,
  );
  await employees.update(f.tenant.id, f.actor, latest.id, {
    role: 'ADMIN',
    canManageFiscalSequences: true,
    permissionOverrides: { 'quotes.create': false },
  });
  const changed = await employees.update(f.tenant.id, f.actor, latest.id, {
    role: 'ORDER_TAKER',
  });
  const membership = changed.user.memberships[0];
  assert.deepEqual(membership.permissionOverrides, {});
  assert.equal(membership.canManageFiscalSequences, false);
  assert.equal(effectivePermissions(membership)['settings.fiscal'], false);
  assert.equal(effectivePermissions(membership)['pos.sell'], true);
});

test('los mecánicos no consumen cupos administrativos', async () => {
  const f = await employeeAdminFixture();
  const service = new EmployeesService(db);
  const mechanicInput = () => ({
    name: 'Usuario de prueba',
    email: `${randomUUID()}@example.test`,
    role: 'MECHANIC',
    password: 'Integration-only-123!',
  });
  const mechanics = [];
  for (let index = 0; index < 6; index += 1) {
    mechanics.push(await service.create(f.tenant.id, f.actor, mechanicInput()));
  }
  assert.deepEqual(await service.userLimit(f.tenant.id), {
    limit: 5,
    used: 1,
    available: 4,
    mechanics: 6,
  });

  for (let index = 0; index < 4; index += 1) {
    await service.create(f.tenant.id, f.actor, {
      name: 'Coordinador de prueba',
      email: `${randomUUID()}@example.test`,
      role: 'ORDER_TAKER',
      password: 'Integration-only-123!',
    });
  }
  const extraMechanic = await service.create(f.tenant.id, f.actor, mechanicInput());
  await assert.rejects(
    service.update(f.tenant.id, f.actor, mechanics[0].id, { role: 'ORDER_TAKER' }),
    /máximo de 5/,
  );
  await service.update(f.tenant.id, f.actor, extraMechanic.id, { status: 'INACTIVE' });
  await service.update(f.tenant.id, f.actor, extraMechanic.id, { status: 'ACTIVE' });
  assert.deepEqual(await service.userLimit(f.tenant.id), {
    limit: 5,
    used: 5,
    available: 0,
    mechanics: 7,
  });
});

test('demo aditiva usa flujos reales, conserva usuarios/facturas y no duplica contenido al reintentar', async () => {
  const f = await employeeAdminFixture();
  await mechanicFixture(f);
  const before = {
    users: await db.user.count(),
    products: await db.product.count({ where: { tenantId: f.tenant.id } }),
    tickets: await db.workshopTicket.count({ where: { tenantId: f.tenant.id } }),
    invoices: await db.invoice.count(),
    sequences: await db.fiscalSequence.count(),
  };
  const result = await populateWorkshopDemo(db, f.tenant.id);
  assert.equal(result.skipped, false);
  assert.equal(await db.user.count(), before.users);
  assert.equal(await db.invoice.count(), before.invoices);
  assert.equal(await db.fiscalSequence.count(), before.sequences);
  assert.equal(await db.product.count({ where: { tenantId: f.tenant.id } }), before.products + 7);
  assert.equal(
    await db.workshopTicket.count({ where: { tenantId: f.tenant.id } }),
    before.tickets + 7,
  );
  const ready = await db.workshopTicket.findFirstOrThrow({
    where: { tenantId: f.tenant.id, status: 'READY_FOR_DELIVERY' },
    include: { qualityCheck: true, lines: true, tasks: true },
  });
  assert.equal(ready.qualityCheck.status, 'APPROVED');
  assert.equal(ready.tasks[0].status, 'COMPLETED');
  assert.ok(ready.lines.every((line) => line.approvalStatus === 'APPROVED'));
  assert.equal(ready.lines.find((line) => line.type === 'PART').consumedQuantity.toNumber(), 1);
  const unchanged = await db.workshopTicket.findUniqueOrThrow({ where: { id: f.ticket.id } });
  assert.equal(unchanged.complaint, 'Diagnóstico de prueba');
  assert.equal((await populateWorkshopDemo(db, f.tenant.id)).skipped, true);
  assert.equal(
    await db.workshopTicket.count({ where: { tenantId: f.tenant.id } }),
    before.tickets + 7,
  );
});

test('alta de empleado exige contraseña propia y nunca modifica una identidad de otra empresa', async () => {
  const f = await employeeAdminFixture();
  const other = await employeeAdminFixture();
  const employees = new EmployeesService(db);
  const before = await db.user.findUniqueOrThrow({ where: { id: other.user.id } });
  const input = {
    name: 'No debe sustituir nombre',
    email: other.user.email,
    password: 'Integration-only-123!',
    role: 'CASHIER',
  };
  await assert.rejects(employees.create(f.tenant.id, f.actor, input), /reutilizar ni modificar/);
  assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: other.user.id } }), before);
  await assert.rejects(
    employees.create(f.tenant.id, f.actor, {
      ...input,
      email: `${randomUUID()}@example.test`,
      password: undefined,
    }),
    /contraseña/,
  );
  await assert.rejects(
    employees.create(f.tenant.id, f.actor, { ...input, role: 'SUPER_ADMIN' }),
    /role cannot/,
  );
  await assert.rejects(
    employees.create(f.tenant.id, f.actor, { ...input, permissionOverrides: { typo: true } }),
    /claves conocidas/,
  );
});

test('administración de accesos conserva un administrador y revalida al actor bajo bloqueo', async () => {
  const f = await employeeAdminFixture();
  const employees = new EmployeesService(db);
  await assert.rejects(
    employees.update(f.tenant.id, f.actor, f.profile.id, { role: 'MECHANIC' }),
    /active admin/,
  );
  const second = await employees.create(f.tenant.id, f.actor, {
    name: 'Otro administrador',
    email: `${randomUUID()}@example.test`,
    password: 'Integration-only-123!',
    role: 'ADMIN',
  });
  const secondActor = await db.user.findUniqueOrThrow({
    where: { id: second.userId },
    include: { memberships: true },
  });
  const results = await Promise.allSettled([
    employees.update(f.tenant.id, f.actor, second.id, { role: 'MECHANIC' }),
    employees.update(f.tenant.id, secondActor, f.profile.id, { role: 'MECHANIC' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    await db.membership.count({
      where: { tenantId: f.tenant.id, role: 'ADMIN', status: 'ACTIVE' },
    }),
    1,
  );
});

function checkRoute(controller, method, user, tenantId) {
  return new RolesGuard(new Reflector()).canActivate({
    getHandler: () => controller.prototype[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ tenantId, user }) }),
  });
}

test('JWT consulta permisos actuales: revocar cobro bloquea el mismo token y /auth/me no expone secretos', async () => {
  const f = await employeeAdminFixture();
  const employees = new EmployeesService(db);
  const employee = await employees.create(f.tenant.id, f.actor, {
    name: 'Cajero con permisos',
    email: `${randomUUID()}@example.test`,
    password: 'Integration-only-123!',
    role: 'CASHIER',
  });
  const jwt = new JwtService();
  const secret = randomUUID();
  const token = await jwt.signAsync({ sub: employee.userId }, { secret, expiresIn: '5m' });
  const guard = new JwtAuthGuard({ getOrThrow: () => secret }, jwt, db);
  async function authenticate() {
    const request = { headers: { authorization: `Bearer ${token}`, 'x-tenant-id': f.tenant.id } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    await guard.canActivate(context);
    new TenantMembershipGuard().canActivate(context);
    return request;
  }
  let request = await authenticate();
  const auth = new AuthController();
  let access = auth.currentAccess(f.tenant.id, request.user);
  assert.equal(access.permissions['pos.sell'], true);
  assert.deepEqual(Object.keys(access.user).sort(), ['email', 'id', 'name']);
  assert.equal('accessToken' in access, false);
  assert.equal('passwordHash' in request.user, false);
  await employees.update(f.tenant.id, f.actor, employee.id, {
    permissionOverrides: { 'pos.sell': false, 'cash.open': false },
  });
  request = await authenticate();
  access = auth.currentAccess(f.tenant.id, request.user);
  assert.equal(access.permissions['pos.sell'], false);
  assert.equal(access.permissions.canUsePos, false);
  await assert.rejects(
    new PosService(db, {}).completeSale(f.tenant.id, request.user, {
      checkoutKey: randomUUID(),
      items: [],
      amountReceived: 0,
    }),
    /permiso/,
  );
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 0);
  await db.membership.updateMany({
    where: { userId: employee.userId },
    data: { status: 'INACTIVE' },
  });
  await assert.rejects(authenticate(), /does not belong/);
  await db.membership.updateMany({
    where: { userId: employee.userId },
    data: { status: 'ACTIVE' },
  });
  await db.tenant.update({ where: { id: f.tenant.id }, data: { status: 'SUSPENDED' } });
  await assert.rejects(authenticate(), /does not belong/);
});

test('recepción y asesor pueden registrar clientes sin heredar crédito, borrado ni asignaciones', async () => {
  const f = await fixture({ count: 1 });
  const actor = (role, permissionOverrides = {}) => ({
    ...f.user,
    memberships: [{ tenantId: f.tenant.id, status: 'ACTIVE', role, permissionOverrides }],
  });
  for (const role of ['RECEPTIONIST', 'SERVICE_ADVISOR']) {
    assert.equal(checkRoute(CustomersController, 'create', actor(role), f.tenant.id), true);
    assert.throws(
      () => checkRoute(CustomersController, 'configureCredit', actor(role), f.tenant.id),
      /permiso/,
    );
    assert.throws(
      () => checkRoute(CustomersController, 'remove', actor(role), f.tenant.id),
      /permiso/,
    );
  }
  assert.throws(
    () =>
      checkRoute(
        CustomersController,
        'create',
        actor('ADMIN', { 'customers.manage': false }),
        f.tenant.id,
      ),
    /permiso/,
  );
  const controller = new WorkshopController({
    createTicket: () => {
      throw new Error('must-not-write');
    },
  });
  assert.throws(
    () =>
      controller.createTicket(f.tenant.id, actor('RECEPTIONIST'), {
        customerId: f.customer.id,
        vehicleId: f.vehicle.id,
        complaint: 'Consulta',
        lines: [{ type: 'LABOR' }],
      }),
    /permiso/,
  );
  assert.throws(
    () =>
      controller.createTicket(f.tenant.id, actor('RECEPTIONIST'), {
        customerId: f.customer.id,
        vehicleId: f.vehicle.id,
        complaint: 'Consulta',
        mechanicIds: ['unauthorized'],
      }),
    /permiso/,
  );
});

test('gestionar catálogo no permite sobrescribir stock si ajuste está denegado', async () => {
  const f = await fixture({ count: 1 });
  const actor = {
    ...f.user,
    memberships: [
      {
        tenantId: f.tenant.id,
        status: 'ACTIVE',
        role: 'INVENTORY_MANAGER',
        permissionOverrides: { 'inventory.adjust': false },
      },
    ],
  };
  const controller = new ProductsController(new ProductsService(db, new AuditService(db)));
  assert.equal(checkRoute(ProductsController, 'update', actor, f.tenant.id), true);
  await controller.update(f.tenant.id, actor, f.products[0].id, { name: 'Repuesto actualizado' });
  for (const stock of [f.products[0].stock, 0, 100])
    await assert.rejects(
      controller.update(f.tenant.id, actor, f.products[0].id, { stock }),
      /permiso/,
    );
  assert.throws(
    () => controller.create(f.tenant.id, actor, { name: 'No crear', price: 100, stock: 1 }),
    /permiso/,
  );
  const stored = await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } });
  assert.equal(stored.name, 'Repuesto actualizado');
  assert.equal(stored.stock, f.products[0].stock);
});

test('consulta y reimpresión de facturas son accesos separados y caja respeta denegación administrativa', async () => {
  const f = await fixture({ count: 1 });
  const actor = (role, permissionOverrides = {}) => ({
    ...f.user,
    memberships: [{ tenantId: f.tenant.id, status: 'ACTIVE', role, permissionOverrides }],
  });
  const cashier = actor('CASHIER');
  assert.equal(checkRoute(InvoicesController, 'receipt', cashier, f.tenant.id), true);
  assert.throws(() => checkRoute(InvoicesController, 'findAll', cashier, f.tenant.id), /permiso/);
  const accounting = actor('ACCOUNTING', { 'invoices.reprint': false });
  assert.equal(checkRoute(InvoicesController, 'findOne', accounting, f.tenant.id), true);
  assert.throws(
    () => checkRoute(InvoicesController, 'receipt', accounting, f.tenant.id),
    /permiso/,
  );
  assert.throws(() => checkRoute(InvoicesController, 'update', accounting, f.tenant.id), /permiso/);
  const cash = new CashService(db);
  assert.deepEqual(await cash.findSessions(f.tenant.id, accounting), []);
  assert.throws(
    () => cash.findSessions(f.tenant.id, actor('ADMIN', { 'cash.view': false })),
    /permiso/,
  );
});

test('asignar una tarea y registrar su avance requieren permisos independientes', () => {
  const actor = {
    id: 'user',
    status: 'ACTIVE',
    memberships: [
      {
        tenantId: 'tenant',
        status: 'ACTIVE',
        role: 'SUPERVISOR',
        permissionOverrides: { 'tasks.progress': false, 'tasks.cancel': false },
      },
    ],
  };
  const controller = new WorkshopController({ updateTask: () => 'updated' });
  assert.equal(checkRoute(WorkshopController, 'updateTask', actor, 'tenant'), true);
  assert.equal(
    controller.updateTask('tenant', actor, 'ticket', 'task', { title: 'Nueva asignación' }),
    'updated',
  );
  assert.throws(
    () => controller.updateTask('tenant', actor, 'ticket', 'task', { status: 'IN_PROGRESS' }),
    /permiso/,
  );
  assert.throws(
    () =>
      controller.updateTask('tenant', actor, 'ticket', 'task', {
        status: 'CANCELLED',
        cancellationReason: 'Cambio',
      }),
    /permiso/,
  );
});

test('gestionar borradores nunca marca cobrado ni altera un comprobante emitido por fuera de Caja', async () => {
  const f = await fixture({ count: 1 });
  const invoices = new InvoicesService(db, new AuditService(db));
  const input = {
    invoiceNumber: 'TEST-DRAFT',
    items: [{ productId: f.products[0].id, quantity: 1 }],
  };
  for (const status of ['PAID', 'ISSUED', 'ACCEPTED'])
    await assert.rejects(
      invoices.create(f.tenant.id, f.user.id, { ...input, status }),
      /solo gestiona borradores/,
    );
  assert.equal(await db.invoice.count({ where: { tenantId: f.tenant.id } }), 0);
  const draft = await invoices.create(f.tenant.id, f.user.id, input);
  await invoices.update(f.tenant.id, f.user.id, draft.id, { dueDate: '2026-12-01' });
  for (const status of ['PAID', 'CANCELLED', 'VOID'])
    await assert.rejects(
      invoices.update(f.tenant.id, f.user.id, draft.id, { status }),
      /solo gestiona borradores/,
    );
  // A persisted issued document cannot be demoted to a draft, even with the generic edit permission.
  await db.invoice.update({
    where: { id: draft.id },
    data: { status: 'ISSUED', ncf: 'B0200000001' },
  });
  await assert.rejects(
    invoices.update(f.tenant.id, f.user.id, draft.id, { status: 'DRAFT' }),
    /solo gestiona borradores/,
  );
  assert.equal(
    (await db.invoice.findUniqueOrThrow({ where: { id: draft.id } })).paidAmount.toNumber(),
    0,
  );
  assert.equal(await db.payment.count({ where: { tenantId: f.tenant.id } }), 0);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock,
    f.products[0].stock,
  );
});

async function erpActor(tenantId, role, permissionOverrides = {}) {
  const user = await db.user.create({
    data: { name: `Prueba ${role}`, email: `${randomUUID()}@example.test` },
  });
  const membership = await db.membership.create({
    data: { tenantId, userId: user.id, role, permissionOverrides },
  });
  await db.employeeProfile.create({ data: { tenantId, userId: user.id } });
  return { ...user, memberships: [membership] };
}

function withPermissions(user, permissionOverrides) {
  return {
    ...user,
    memberships: user.memberships.map((membership) => ({
      ...membership,
      permissionOverrides: { ...membership.permissionOverrides, ...permissionOverrides },
    })),
  };
}

function invokeErp(controller, method, tenantId, user, ...args) {
  checkRoute(controller.constructor, method, user, tenantId);
  return controller[method](tenantId, user, ...args);
}

test('compras: inventario solicita, gerencia emite, contabilidad captura y el receptor confirma sin pagar', async () => {
  const f = await fixture({ count: 1, stock: 3 });
  const inventory = await erpActor(f.tenant.id, 'INVENTORY_MANAGER');
  const manager = await erpActor(f.tenant.id, 'MANAGER');
  const accounting = await erpActor(f.tenant.id, 'ACCOUNTING');
  const supplier = await db.supplier.create({
    data: {
      tenantId: f.tenant.id,
      commercialName: 'Proveedor de pruebas',
      documentType: 'RNC',
      documentNumber: '131000000',
      createdById: f.user.id,
    },
  });
  const purchases = new PurchasingService(db, new AuditService(db));
  const order = await purchases.create(f.tenant.id, inventory, {
    supplierId: supplier.id,
    items: [{ productId: f.products[0].id, quantity: 2, unitCostNet: 50, taxRate: 0.18 }],
  });
  await purchases.request(f.tenant.id, inventory, order.id);
  assert.throws(() => purchases.issue(f.tenant.id, inventory, order.id), /permiso/);
  assert.throws(
    () =>
      purchases.issue(
        f.tenant.id,
        withPermissions(manager, { 'purchasing.approve': false }),
        order.id,
      ),
    /permiso/,
  );
  await purchases.issue(f.tenant.id, manager, order.id);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 3);
  const invoiceService = new SupplierInvoicesService(db, new ReceiptsService(db));
  const controller = new SupplierInvoicesController(invoiceService);
  const invoice = await invokeErp(controller, 'create', f.tenant.id, accounting, {
    supplierId: supplier.id,
    purchaseOrderId: order.id,
    invoiceNumber: 'SUP-TEST-001',
    issueDate: '2026-09-06',
    dueDate: '2026-09-30',
    items: [
      {
        productId: f.products[0].id,
        purchaseOrderItemId: order.items[0].id,
        quantity: 2,
        unitCostNet: 50,
        taxRate: 0.18,
      },
    ],
  });
  const input = {
    items: [
      { supplierInvoiceItemId: invoice.items[0].id, quantityReceived: 2, priceDecision: 'KEEP' },
    ],
  };
  assert.throws(
    () => invokeErp(controller, 'confirmEntry', f.tenant.id, accounting, invoice.id, input),
    /permiso/,
  );
  const result = await invokeErp(
    controller,
    'confirmEntry',
    f.tenant.id,
    inventory,
    invoice.id,
    input,
  );
  const payablesOnly = withPermissions(accounting, { 'supplier_invoices.view': false });
  assert.equal(
    checkRoute(SupplierInvoicesController, 'getPayableInvoices', payablesOnly, f.tenant.id),
    true,
  );
  assert.throws(
    () => checkRoute(SupplierInvoicesController, 'findAll', payablesOnly, f.tenant.id),
    /permiso/,
  );
  assert.ok(
    (await controller.getPayableInvoices(f.tenant.id, {})).some((row) => row.id === invoice.id),
  );
  assert.equal(result.invoice.status, 'PENDING');
  assert.equal(result.invoice.balance.toNumber(), 118);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 5);
  assert.equal(
    (await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
    'RECEIVED',
  );
  assert.throws(
    () =>
      invokeErp(controller, 'registerPayment', f.tenant.id, inventory, invoice.id, {
        method: 'TRANSFER',
        amount: 118,
        reference: 'TEST',
      }),
    /permiso/,
  );
  assert.throws(
    () =>
      invokeErp(controller, 'registerPayment', f.tenant.id, accounting, invoice.id, {
        method: 'TRANSFER',
        amount: 118,
        reference: 'TEST',
      }),
    /permiso/,
  );
  await invokeErp(
    controller,
    'registerPayment',
    f.tenant.id,
    withPermissions(accounting, { 'payables.pay': true }),
    invoice.id,
    { method: 'TRANSFER', amount: 118, reference: 'TEST-PAY' },
  );
  const paid = await invoiceService.findOne(f.tenant.id, invoice.id);
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.balance.toNumber(), 0);
  assert.throws(
    () =>
      invokeErp(
        controller,
        'cancelPayment',
        f.tenant.id,
        accounting,
        invoice.id,
        paid.payments[0].id,
        { reason: 'Prueba de reversión' },
      ),
    /permiso/,
  );
  await invokeErp(
    controller,
    'cancelPayment',
    f.tenant.id,
    manager,
    invoice.id,
    paid.payments[0].id,
    { reason: 'Corrección de prueba' },
  );
  const reversed = await invoiceService.findOne(f.tenant.id, invoice.id);
  assert.equal(reversed.balance.toNumber(), 118);
  assert.equal(reversed.payments[0].status, 'CANCELLED');
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 5);
  assert.equal(await db.cashMovement.count({ where: { tenantId: f.tenant.id } }), 0);
});

test('recibir inventario no concede cambiar precios ni mantener esos cambios en borradores ajenos', async () => {
  const actor = {
    id: 'user',
    status: 'ACTIVE',
    memberships: [
      {
        tenantId: 'tenant',
        role: 'INVENTORY_MANAGER',
        status: 'ACTIVE',
        permissionOverrides: { 'products.manage': false },
      },
    ],
  };
  const receipts = new ReceiptsController({
    create: () => 'kept',
    update: () => 'kept',
    findOne: async () => ({ items: [{ priceDecision: 'MANUAL', manualSalePrice: 100 }] }),
    confirm: () => {
      throw new Error('must-not-confirm');
    },
  });
  const controller = new SupplierInvoicesController({
    confirmEntry: () => {
      throw new Error('must-not-confirm');
    },
  });
  for (const priceDecision of ['MANUAL', 'RECALCULATE_MARGIN']) {
    const input = {
      items: [{ priceDecision, quantityReceived: 1, supplierInvoiceItemId: 'item' }],
    };
    assert.throws(() => invokeErp(receipts, 'create', 'tenant', actor, input), /permiso/);
    assert.throws(
      () => invokeErp(receipts, 'update', 'tenant', actor, 'receipt', input),
      /permiso/,
    );
    assert.throws(
      () => invokeErp(controller, 'confirmEntry', 'tenant', actor, 'invoice', input),
      /permiso/,
    );
  }
  assert.equal(
    invokeErp(receipts, 'create', 'tenant', actor, { items: [{ priceDecision: 'KEEP' }] }),
    'kept',
  );
  await assert.rejects(invokeErp(receipts, 'confirm', 'tenant', actor, 'receipt'), /permiso/);
  const service = new ReceiptsService({});
  service.runSerializable = async (operation) => operation({});
  service.getReceiptForMutation = async () => ({
    items: [{ priceDecision: 'MANUAL', manualSalePrice: 100 }],
  });
  // A stale controller read said KEEP; the transaction must check persisted choices again.
  const staleReadController = new ReceiptsController({
    findOne: async () => ({ items: [{ priceDecision: 'KEEP' }] }),
    confirm: service.confirm.bind(service),
  });
  await assert.rejects(
    invokeErp(staleReadController, 'confirm', 'tenant', actor, 'receipt'),
    /permiso/,
  );
});

test('cuentas por cobrar: consultar no cobra, abono autorizado es idempotente y anular exige permiso propio', async () => {
  const f = await fixture({ count: 1 });
  const cashier = await cashierFixture(f);
  const accounting = await erpActor(f.tenant.id, 'ACCOUNTING');
  const manager = await erpActor(f.tenant.id, 'MANAGER');
  const invoice = await db.invoice.create({
    data: {
      tenantId: f.tenant.id,
      customerId: f.customer.id,
      invoiceNumber: 'TEST-CREDIT',
      paymentMode: 'CREDIT',
      status: 'ISSUED',
      subtotal: 100,
      taxTotal: 18,
      total: 118,
      balance: 118,
    },
  });
  const service = new ReceivablesService(db);
  const input = { amount: 50, cashSessionId: cashier.cashSession.id, idempotencyKey: randomUUID() };
  assert.ok(
    (await service.findAll(f.tenant.id, accounting, {})).some((row) => row.id === invoice.id),
  );
  await assert.rejects(
    service.createPayment(f.tenant.id, accounting, invoice.id, input),
    /permiso/,
  );
  const collector = withPermissions(accounting, { 'receivables.collect': true });
  const cash = new CashService(db);
  const restrictedCollector = withPermissions(collector, { 'cash.view': false });
  assert.throws(() => cash.findSessions(f.tenant.id, restrictedCollector), /permiso/);
  assert.throws(() => cash.findPaymentSessions(f.tenant.id, accounting), /permiso/);
  assert.throws(() => cash.findPaymentSessions('foreign-tenant', restrictedCollector), /permiso/);
  const paymentOptions = await cash.findPaymentSessions(f.tenant.id, restrictedCollector);
  assert.deepEqual(
    paymentOptions.map((row) => row.id),
    [cashier.cashSession.id],
  );
  assert.deepEqual(Object.keys(paymentOptions[0]).sort(), [
    'cashRegister',
    'id',
    'openedBy',
    'status',
  ]);
  const first = await service.createPayment(f.tenant.id, collector, invoice.id, input);
  const retry = await service.createPayment(f.tenant.id, collector, invoice.id, input);
  assert.equal(retry.id, first.id);
  assert.equal(
    (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).balance.toNumber(),
    68,
  );
  await assert.rejects(
    service.cancelPayment(f.tenant.id, collector, first.id, {
      cashSessionId: cashier.cashSession.id,
      reason: 'Corregir recibo',
    }),
    /permiso/,
  );
  await service.cancelPayment(f.tenant.id, manager, first.id, {
    cashSessionId: cashier.cashSession.id,
    reason: 'Corregir recibo',
  });
  const restored = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(restored.balance.toNumber(), 118);
  assert.equal(restored.paidAmount.toNumber(), 0);
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: first.id } })).status,
    'CANCELLED',
  );
  await assert.rejects(
    service.createPayment('foreign-tenant', collector, invoice.id, input),
    /permiso/,
  );
});

test('devolución: cajero solicita sin aprobar, gerencia autoriza y no se duplica reintegro', async () => {
  const f = await fixture({ count: 1, stock: 2 });
  const cashier = await cashierFixture(f);
  const manager = await erpActor(f.tenant.id, 'MANAGER');
  const sale = await new PosService(db, {}).completeSale(f.tenant.id, cashier.user, {
    checkoutKey: randomUUID(),
    cashSessionId: cashier.cashSession.id,
    documentType: 'CONSUMER_02',
    items: [{ productId: f.products[0].id, quantity: 1 }],
    paymentMethod: 'CASH',
    amountReceived: 118,
  });
  const invoice = sale.invoice ?? sale;
  const storedInvoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { items: true },
  });
  const service = new ReturnsService(db);
  const request = await service.create(f.tenant.id, cashier.user, {
    invoiceId: storedInvoice.id,
    reason: 'Repuesto sin usar',
    items: [{ invoiceItemId: storedInvoice.items[0].id, quantity: 1, restock: true }],
  });
  const input = {
    cashSessionId: cashier.cashSession.id,
    refundMethod: 'CASH',
    adminNote: 'Revisado por gerencia',
  };
  await assert.rejects(service.approve(f.tenant.id, cashier.user, request.id, input), /permiso/);
  await assert.rejects(
    service.approve(
      f.tenant.id,
      withPermissions(manager, { 'returns.approve': false }),
      request.id,
      input,
    ),
    /permiso/,
  );
  assert.equal((await service.findAll(f.tenant.id, manager)).length, 1);
  const otherCashier = await erpActor(f.tenant.id, 'CASHIER');
  assert.equal((await service.findAll(f.tenant.id, otherCashier)).length, 0);
  await service.approve(f.tenant.id, manager, request.id, input);
  await assert.rejects(
    service.approve(f.tenant.id, manager, request.id, input),
    /Only requested returns/,
  );
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stock, 2);
  assert.equal(
    await db.cashMovement.count({ where: { tenantId: f.tenant.id, type: 'REFUND' } }),
    1,
  );
  assert.equal(
    (await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
    'COMPLETED',
  );
});

test('retiros de caja y exceso de crédito no se habilitan por simple acceso de consulta', async () => {
  const f = await fixture({ count: 1 });
  const cashier = await cashierFixture(f);
  const accounting = await erpActor(f.tenant.id, 'ACCOUNTING');
  const manager = await erpActor(f.tenant.id, 'MANAGER');
  const cash = new CashService(db);
  const input = {
    cashSessionId: cashier.cashSession.id,
    type: 'CASH_OUT',
    amount: 25,
    reason: 'Retiro autorizado',
  };
  await assert.rejects(cash.createMovement(f.tenant.id, accounting, input), /permiso/);
  await assert.rejects(
    cash.createMovement(f.tenant.id, withPermissions(manager, { 'cash.withdraw': false }), input),
    /permiso/,
  );
  await cash.createMovement(f.tenant.id, manager, input);
  assert.equal(
    await db.cashMovement.count({ where: { tenantId: f.tenant.id, type: 'CASH_OUT' } }),
    1,
  );
  const credit = new CreditApprovalsService(db);
  await assert.rejects(credit.approve(f.tenant.id, accounting, 'unused', {}), /permiso/);
  await assert.rejects(
    credit.approve(
      f.tenant.id,
      withPermissions(manager, { 'credit.override_limit': false }),
      'unused',
      { authorizeLimitExcess: true },
    ),
    /permiso/,
  );
  assert.throws(
    () => checkRoute(SuppliersController, 'create', accounting, f.tenant.id),
    /permiso/,
  );
  assert.equal(checkRoute(SuppliersController, 'create', manager, f.tenant.id), true);
  assert.throws(
    () =>
      checkRoute(
        SuppliersController,
        'create',
        withPermissions(manager, { 'suppliers.manage': false }),
        f.tenant.id,
      ),
    /permiso/,
  );
});
