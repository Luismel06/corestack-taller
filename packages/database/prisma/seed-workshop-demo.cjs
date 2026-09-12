// Additive workshop demo. Never clears data, creates users, allocates fiscal numbers or sends email.
const { createRequire } = require('node:module');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const apiRequire = createRequire(path.resolve(__dirname, '../../../apps/api/package.json'));
const { PrismaClient } = apiRequire('@qorvex/database');
const { WorkshopService } = require('../../../apps/api/dist/modules/workshop/workshop.service');
const { ProductsService } = require('../../../apps/api/dist/modules/products/products.service');
const { AuditService } = require('../../../apps/api/dist/modules/audit/audit.service');
const version = 'WORKSHOP_DEMO_V1';
const marker = '[DEMO TALLER] Datos ficticios para demostración.';
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
  observations: marker,
};

async function populateWorkshopDemo(db, tenantId) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || tenant.status !== 'ACTIVE') throw new Error('Empresa de demo no disponible.');
      const previous = await tx.auditLog.findFirst({ where: { tenantId, action: version } });
      if (previous) return { skipped: true, ...previous.metadata };
      const admin = await tx.membership.findFirst({
        where: { tenantId, role: 'ADMIN', status: 'ACTIVE', user: { status: 'ACTIVE' } },
        include: { user: true },
      });
      const mechanic = await tx.employeeProfile.findFirst({
        where: {
          tenantId,
          status: 'ACTIVE',
          user: {
            status: 'ACTIVE',
            memberships: {
              some: { tenantId, status: 'ACTIVE', role: 'MECHANIC' },
            },
          },
        },
      });
      if (!admin || !mechanic)
        throw new Error(
          'Se necesita un administrador y un mecánico existentes. No se crean ni cambian usuarios.',
        );
      // Existing service transactions participate in this one atomic, tenant-locked seed.
      const client = new Proxy(tx, {
        get(target, property) {
          if (property === '$transaction')
            return (operation) => {
              if (typeof operation !== 'function')
                throw new Error('Unsupported nested seed transaction.');
              return operation(tx);
            };
          return Reflect.get(target, property);
        },
      });
      const audit = new AuditService(client);
      const workshop = new WorkshopService(client, audit);
      const products = new ProductsService(client, audit);
      const actor = { ...admin.user, memberships: [admin] };
      const code = createHash('sha256').update(tenantId).digest('hex').slice(0, 10);
      const names = [
        'María Fernández',
        'Juan Martínez',
        'Ana López',
        'Rafael Mejía',
        'Lucía Vargas',
        'Domingo Castillo',
      ];
      const customers = [];
      for (let index = 0; index < names.length; index++)
        customers.push(
          await tx.customer.create({
            data: {
              tenantId,
              name: `${names[index]} · Demo`,
              documentType: 'CONSUMER_FINAL',
              email: `cliente-${index + 1}-${code}@demo.invalid`,
              phone: `809-555-01${String(index + 10)}`,
              address: 'Santo Domingo · dirección ficticia',
            },
          }),
        );
      const parts = [];
      for (const [index, item] of [
        ['Filtro de aceite', 450, 210],
        ['Pastillas de freno delanteras', 2200, 1250],
        ['Filtro de aire', 850, 400],
        ['Bujía de encendido', 480, 220],
      ].entries())
        parts.push(
          await products.create(tenantId, admin.userId, {
            name: `${item[0]} · Demo`,
            sku: `DEMO-${code}-P${index + 1}`,
            price: item[1],
            cost: item[2],
            stock: index === 3 ? 2 : 12,
            minStock: 3,
            unit: 'UNIT',
            taxRate: 0.18,
            taxCategory: 'ITBIS_18',
            trackInventory: true,
            status: 'ACTIVE',
            description: marker,
          }),
        );
      const services = [];
      for (const [index, item] of [
        ['Mantenimiento preventivo', 1500, 60],
        ['Servicio de frenos', 2500, 90],
        ['Diagnóstico de motor', 1200, 45],
      ].entries())
        services.push(
          await workshop.createService(tenantId, admin.userId, {
            code: `DEMO-${code}-S${index + 1}`,
            name: `${item[0]} · Demo`,
            defaultPrice: item[1],
            estimatedMinutes: item[2],
            taxRate: 0.18,
            category: 'Demostración',
            description: marker,
          }),
        );
      const vehicles = [];
      const vehicleData = [
        ['Toyota', 'Corolla', 2019, 'Gris', 'CAR'],
        ['Hyundai', 'Accent', 2018, 'Plata', 'CAR'],
        ['Kia', 'Sportage', 2020, 'Negro', 'SUV'],
        ['Nissan', 'Sentra', 2016, 'Blanco', 'CAR'],
        ['Mitsubishi', 'Lancer', 2015, 'Azul', 'CAR'],
        ['Suzuki', 'Vitara', 2018, 'Rojo', 'SUV'],
        ['Ford', 'Ranger', 2016, 'Blanco', null],
      ];
      const statuses = [
        'RECEIVED',
        'RECEIVED',
        'DIAGNOSIS',
        'DIAGNOSIS',
        'AWAITING_APPROVAL',
        'IN_PROGRESS',
        'READY_FOR_DELIVERY',
      ];
      const now = Date.now();
      for (let index = 0; index < vehicleData.length; index++) {
        const [make, model, year, color, vehicleType] = vehicleData[index];
        const customer = customers[index % customers.length];
        const vehicle = await workshop.createVehicle(tenantId, admin.userId, {
          customerId: customer.id,
          vehicleType: vehicleType ?? undefined,
          make,
          model,
          year,
          color,
          licensePlate: `DEMO${index + 101}`,
          mileage: 50000 + index * 4500,
          notes: marker,
        });
        vehicles.push(vehicle);
        const part = parts[index % parts.length];
        const service = services[index % services.length];
        let ticket = await workshop.createTicket(tenantId, admin.userId, {
          customerId: customer.id,
          vehicleId: vehicle.id,
          complaint: [
            'Mantenimiento y revisión general',
            'Ruido al frenar',
            'Luz de motor encendida',
          ][index % 3],
          internalNotes: marker,
          priority: index === 4 ? 'HIGH' : 'NORMAL',
          promisedAt: new Date(now + (index + 2) * 3600000).toISOString(),
          mechanicIds: index >= 2 ? [mechanic.id] : [],
          lines: [
            {
              type: 'LABOR',
              serviceId: service.id,
              description: service.name,
              quantity: 1,
              unitPrice: Number(service.defaultPrice),
            },
            {
              type: 'PART',
              productId: part.id,
              description: part.name,
              quantity: 1,
              unitPrice: Number(part.price),
            },
          ],
        });
        await workshop.createReception(tenantId, admin.userId, ticket.id, {
          mileage: vehicle.mileage,
          fuelLevel: 'Medio tanque',
          observations: marker,
        });
        if (statuses[index] === 'RECEIVED') continue;
        await workshop.updateTicket(tenantId, admin.userId, ticket.id, {
          status: 'DIAGNOSIS',
          diagnosis: `${marker} Revisión de componentes y mantenimiento recomendado.`,
        });
        await workshop.saveInspection(tenantId, admin.userId, ticket.id, {
          items: [
            {
              code: 'BRAKES',
              label: 'Frenos',
              result: index === 4 ? 'REQUIRES_REPAIR' : 'ATTENTION',
              comment: marker,
            },
            { code: 'LIGHTS', label: 'Luces', result: 'GOOD' },
          ],
        });
        if (statuses[index] === 'DIAGNOSIS') continue;
        ticket = await workshop.updateTicket(tenantId, admin.userId, ticket.id, {
          status: 'AWAITING_APPROVAL',
        });
        if (statuses[index] === 'AWAITING_APPROVAL') continue;
        ticket = await workshop.respondApproval(tenantId, admin.userId, ticket.id, {
          status: 'APPROVED',
          quoteVersionId: ticket.quoteVersions[0].id,
          authorizedByName: customer.name,
          method: 'IN_PERSON',
          note: marker,
        });
        ticket = await workshop.updateTicket(tenantId, admin.userId, ticket.id, {
          status: 'IN_PROGRESS',
        });
        for (const line of ticket.lines.filter((line) => line.type === 'PART')) {
          await workshop.movePart(tenantId, admin.userId, ticket.id, line.id, 'consume', {
            quantity: 1,
            operationKey: randomUUID(),
            note: marker,
          });
        }
        const task = await workshop.createTask(tenantId, admin.userId, ticket.id, {
          kind: 'REPAIR',
          ticketLineId: ticket.lines.find((line) => line.type === 'LABOR').id,
          employeeId: mechanic.id,
          title: service.name,
          estimatedMinutes: service.estimatedMinutes,
        });
        if (statuses[index] === 'IN_PROGRESS') continue; // Assigned, still pending: no invented live timer.
        await workshop.updateTask(tenantId, actor, ticket.id, task.id, { status: 'IN_PROGRESS' });
        await workshop.updateTask(tenantId, actor, ticket.id, task.id, { status: 'COMPLETED' });
        await workshop.saveQualityCheck(tenantId, admin.userId, ticket.id, quality);
        await workshop.updateTicket(tenantId, admin.userId, ticket.id, {
          status: 'READY_FOR_DELIVERY',
        });
      }
      for (let index = 0; index < 3; index++)
        await workshop.createAppointment(tenantId, admin.userId, {
          customerId: vehicles[index].customerId,
          vehicleId: vehicles[index].id,
          startsAt: new Date(now + (index + 1) * 86400000).toISOString(),
          estimatedMinutes: 60,
          reason: 'Revisión preventiva · Demo',
          notes: marker,
        });
      const result = {
        customers: 6,
        vehicles: 7,
        tickets: 7,
        appointments: 3,
        parts: 4,
        services: 3,
        usersCreated: 0,
        invoicesCreated: 0,
      };
      await audit.log(
        {
          tenantId,
          userId: admin.userId,
          action: version,
          entity: 'Tenant',
          entityId: tenantId,
          metadata: result,
        },
        tx,
      );
      return { skipped: false, ...result };
    },
    { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 },
  );
}

async function main() {
  const tenantSlug = process.argv.find((arg) => arg.startsWith('--tenant='))?.slice(9);
  if (!tenantSlug)
    throw new Error('Indica --tenant=slug. Solo se agrega contenido a una empresa existente.');
  const source = new URL(process.env.DATABASE_URL);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname);
  if (!isLocal || process.env.NODE_ENV === 'production')
    throw new Error(
      'Este cargador se ejecuta únicamente en la copia local de demo antes de migrarla.',
    );
  const db = new PrismaClient();
  try {
    const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new Error('No existe la empresa indicada.');
    if (!process.argv.includes('--apply')) {
      console.log(
        JSON.stringify(
          {
            mode: 'PREVIEW',
            company: tenant.name,
            slug: tenant.slug,
            adds: '6 clientes, 7 vehículos/OT, 3 citas, 4 repuestos y 3 servicios. Sin borrar datos, crear usuarios, facturas ni secuencias.',
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(JSON.stringify(await populateWorkshopDemo(db, tenant.id), null, 2));
  } finally {
    await db.$disconnect();
  }
}
module.exports = { populateWorkshopDemo };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
