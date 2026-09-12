import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { requirePermissions } from '../../common/authorization';
import { AuditService } from '../audit/audit.service';
import { CreateAdvanceDto, RefundAdvanceDto, CreateExpenseDto, ExpenseActionDto, CreateExternalJobDto, ExternalJobActionDto, CreateWarrantyDto, CreateWarrantyClaimDto, ResolveWarrantyClaimDto, CreateMaintenanceDto, MaintenanceActionDto } from './dto/workshop-support.dto';

const ticketSummary = { id: true, ticketNumber: true, status: true, vehicle: true, customer: { select: { id: true, name: true } } } satisfies Prisma.WorkshopTicketSelect;
const validInvoice = (invoice: { status: string } | null | undefined) => invoice && !['DRAFT', 'CANCELLED', 'VOID', 'VOIDED'].includes(invoice.status);

@Injectable()
export class WorkshopSupportService {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

  private async transaction<T>(tenantId: string, userId: string, permission: string, run: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async tx => {
          const user = await tx.user.findUnique({ where: { id: userId }, include: { memberships: true } });
          requirePermissions(user ?? undefined, tenantId, permission);
          return run(tx);
        }, { isolationLevel: 'Serializable', timeout: 20000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code) && attempt < 3) continue;
        throw error;
      }
    }
  }
  private async ticket(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "WorkshopTicket" WHERE "id"=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Orden de trabajo no encontrada.');
    return tx.workshopTicket.findUniqueOrThrow({ where: { id }, include: { lines: true, vehicle: true, salesOrder: { include: { invoice: true } } } });
  }
  private async cash(tx: Prisma.TransactionClient, tenantId: string, id: string | undefined, userId: string, own = false) {
    if (!id) throw new BadRequestException('Selecciona una sesión de caja abierta.');
    await tx.$queryRaw`SELECT "id" FROM "CashSession" WHERE "id"=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
    const session = await tx.cashSession.findFirst({ where: { id, tenantId, status: 'OPEN', ...(own ? { openedById: userId } : {}) } });
    if (!session) throw new BadRequestException(own ? 'Abre tu caja antes de recibir anticipos.' : 'La caja seleccionada no está abierta.');
    return session;
  }
  private method(method: string | undefined, reference?: string) {
    if (!method || !['CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'].includes(method)) throw new BadRequestException('Selecciona un método de pago.');
    if (method !== 'CASH' && !reference?.trim()) throw new BadRequestException('Indica la referencia de la operación.');
  }
  private log(tx: Prisma.TransactionClient, tenantId: string, userId: string, action: string, entityId: string, before: unknown, after: unknown) {
    return this.audit.log({ tenantId, userId, action, entity: 'WorkshopSupport', entityId, metadata: JSON.parse(JSON.stringify({ before, after })) }, tx);
  }
  private money(value: number) {
    if (!Number.isFinite(value) || value <= 0 || value > 999999999.99 || !new Prisma.Decimal(value).eq(new Prisma.Decimal(value).toDecimalPlaces(2))) throw new BadRequestException('Indica un monto positivo con hasta dos decimales.');
    return new Prisma.Decimal(value);
  }
  private async supplier(tx: Prisma.TransactionClient, tenantId: string, id?: string) {
    if (!id) return null;
    const supplier = await tx.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado.');
    return supplier;
  }

  advances(tenantId: string) {
    return this.db.workshopAdvance.findMany({ where: { tenantId }, include: { ticket: { select: ticketSummary } }, orderBy: { createdAt: 'desc' } });
  }
  receiveAdvance(tenantId: string, userId: string, dto: CreateAdvanceDto) {
    return this.transaction(tenantId, userId, 'cash.advances', async tx => {
      const amount = this.money(dto.amount);
      this.method(dto.method, dto.reference);
      const existing = await tx.workshopAdvance.findUnique({ where: { tenantId_requestKey: { tenantId, requestKey: dto.requestKey } } });
      if (existing) {
        if (existing.ticketId !== dto.ticketId || !existing.amount.eq(amount) || existing.method !== dto.method || existing.receivedById !== userId || existing.cashSessionId !== dto.cashSessionId || (existing.reference ?? '') !== (dto.reference?.trim() ?? '')) throw new ConflictException('La clave del recibo ya fue utilizada con otros datos.');
        return existing;
      }
      const ticket = await this.ticket(tx, tenantId, dto.ticketId);
      if (ticket.salesOrderId || ['CANCELLED', 'DELIVERED'].includes(ticket.status)) throw new BadRequestException('Recibe el anticipo antes de enviar la orden a caja; si ya fue facturada, registra un abono.');
      const session = await this.cash(tx, tenantId, dto.cashSessionId, userId, true);
      const advance = await tx.workshopAdvance.create({ data: { tenantId, ticketId: dto.ticketId, requestKey: dto.requestKey, amount, method: dto.method, reference: dto.reference?.trim(), cashSessionId: session.id, receivedById: userId } });
      await tx.cashMovement.create({ data: { tenantId, cashSessionId: session.id, userId, type: 'CASH_IN', method: dto.method, amount, reference: advance.id, reason: `Anticipo ${ticket.ticketNumber}` } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_ADVANCE_RECEIVED', advance.id, null, advance);
      return advance;
    });
  }
  refundAdvance(tenantId: string, userId: string, id: string, dto: RefundAdvanceDto) {
    return this.transaction(tenantId, userId, 'cash.refund_advances', async tx => {
      const advance = await tx.workshopAdvance.findFirst({ where: { id, tenantId } });
      if (!advance) throw new NotFoundException('Anticipo no encontrado.');
      await this.ticket(tx, tenantId, advance.ticketId);
      if (advance.status === 'REFUNDED') return advance;
      if (advance.status !== 'AVAILABLE') throw new BadRequestException('El anticipo aplicado se corrige mediante el flujo de devolución de la factura.');
      if (dto.reason.trim().length < 5) throw new BadRequestException('Indica el motivo del reembolso.');
      const session = await this.cash(tx, tenantId, dto.cashSessionId, userId);
      const result = await tx.workshopAdvance.update({ where: { id }, data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: dto.reason.trim() } });
      await tx.cashMovement.create({ data: { tenantId, cashSessionId: session.id, userId, type: 'REFUND', method: advance.method, amount: advance.amount, reference: id, reason: `Reembolso anticipo: ${dto.reason.trim()}` } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_ADVANCE_REFUNDED', id, advance, result);
      return result;
    });
  }
  expenses(tenantId: string) {
    return this.db.workshopExpense.findMany({ where: { tenantId }, include: { ticket: { select: ticketSummary }, externalJob: true }, orderBy: { incurredAt: 'desc' } });
  }
  createExpense(tenantId: string, userId: string, dto: CreateExpenseDto) {
    return this.transaction(tenantId, userId, 'payables.expenses', async tx => {
      const amount = this.money(dto.amount);
      if (dto.category === 'EXTERNAL_SERVICE') throw new BadRequestException('Registra este costo desde Servicios externos para conservar el vínculo con el trabajo autorizado.');
      if (dto.ticketId) await this.ticket(tx, tenantId, dto.ticketId);
      await this.supplier(tx, tenantId, dto.supplierId);
      const existing = await tx.workshopExpense.findUnique({ where: { tenantId_requestKey: { tenantId, requestKey: dto.requestKey } } });
      if (existing) {
        if (!existing.amount.eq(amount) || existing.description !== dto.description.trim() || existing.category !== dto.category || existing.ticketId !== (dto.ticketId || null) || existing.supplierId !== (dto.supplierId || null)) throw new ConflictException('La clave del gasto ya fue utilizada con otros datos.');
        return existing;
      }
      const expense = await tx.workshopExpense.create({ data: { tenantId, requestKey: dto.requestKey, ticketId: dto.ticketId || null, supplierId: dto.supplierId || null, category: dto.category, description: dto.description.trim(), amount, incurredAt: new Date(dto.incurredAt), dueAt: dto.dueAt ? new Date(dto.dueAt) : null, reference: dto.reference?.trim(), createdById: userId } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_EXPENSE_CREATED', expense.id, null, expense);
      return expense;
    });
  }
  expenseAction(tenantId: string, userId: string, id: string, dto: ExpenseActionDto) {
    return this.transaction(tenantId, userId, dto.action === 'PAY' ? 'payables.pay' : 'payables.cancel_payment', async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkshopExpense" WHERE "id"=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
      const expense = await tx.workshopExpense.findFirst({ where: { id, tenantId }, include: { externalJob: true } });
      if (!expense) throw new NotFoundException('Gasto no encontrado.');
      if ((dto.action === 'PAY' && expense.status === 'PAID') || (dto.action === 'VOID' && expense.status === 'VOID')) return expense;
      if (expense.status === 'VOID') throw new BadRequestException('Este gasto está anulado.');
      if (dto.action === 'VOID' && expense.externalJob?.status !== 'CANCELLED' && expense.externalJob) throw new BadRequestException('Cancela el servicio externo antes de anular su gasto.');
      const paid = dto.action === 'PAY';
      if (paid) this.method(dto.method, dto.reference);
      else if (!dto.reason || dto.reason.trim().length < 5) throw new BadRequestException('Indica el motivo de anulación.');
      let sessionId: string | undefined;
      if (paid || expense.status === 'PAID') {
        const session = await this.cash(tx, tenantId, dto.cashSessionId, userId);
        sessionId = session.id;
        await tx.cashMovement.create({ data: { tenantId, userId, cashSessionId: session.id, type: paid ? 'CASH_OUT' : 'CASH_IN', method: paid ? dto.method : expense.method, amount: expense.amount, reference: id, reason: `${paid ? 'Gasto' : 'Reversión gasto'}: ${expense.description}` } });
      }
      const result = await tx.workshopExpense.update({ where: { id }, data: paid ? { status: 'PAID', paidAt: new Date(), cashSessionId: sessionId, method: dto.method, reference: dto.reference?.trim() } : { status: 'VOID', voidReason: dto.reason?.trim() } });
      await this.log(tx, tenantId, userId, paid ? 'WORKSHOP_EXPENSE_PAID' : 'WORKSHOP_EXPENSE_VOIDED', id, expense, result);
      return result;
    });
  }

  externalJobs(tenantId: string) {
    return this.db.workshopExternalJob.findMany({ where: { tenantId }, include: { ticket: { select: ticketSummary }, expense: true }, orderBy: { sentAt: 'desc' } });
  }
  createExternalJob(tenantId: string, userId: string, dto: CreateExternalJobDto) {
    return this.transaction(tenantId, userId, 'workorders.external', async tx => {
      const ticket = await this.ticket(tx, tenantId, dto.ticketId);
      const supplier = await this.supplier(tx, tenantId, dto.supplierId);
      if (!supplier) throw new BadRequestException('Selecciona el proveedor.');
      const cost = this.money(dto.cost);
      const existing = await tx.workshopExternalJob.findUnique({ where: { ticketLineId: dto.ticketLineId } });
      if (existing) {
        if (existing.tenantId !== tenantId || existing.supplierId !== dto.supplierId || !existing.cost.eq(cost)) throw new ConflictException('La línea ya tiene un servicio externo registrado.');
        return existing;
      }
      const line = ticket.lines.find(line => line.id === dto.ticketLineId);
      if (!['APPROVED', 'IN_PROGRESS'].includes(ticket.status) || !line || line.type !== 'OTHER' || line.approvalStatus !== 'APPROVED') throw new BadRequestException('Selecciona un servicio externo autorizado de una orden en reparación.');
      const expense = await tx.workshopExpense.create({ data: { tenantId, ticketId: ticket.id, requestKey: dto.requestKey, supplierId: supplier.id, category: 'EXTERNAL_SERVICE', description: line.description, amount: cost, incurredAt: new Date(), createdById: userId } });
      const result = await tx.workshopExternalJob.create({ data: { tenantId, ticketId: ticket.id, ticketLineId: line.id, supplierId: supplier.id, supplierName: supplier.commercialName, description: line.description, cost, billedPrice: line.total, expenseId: expense.id, notes: dto.notes?.trim(), createdById: userId } });
      await tx.workshopQualityCheck.updateMany({ where: { ticketId: ticket.id }, data: { status: 'PENDING' } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_EXTERNAL_SENT', result.id, null, result);
      return result;
    });
  }
  externalAction(tenantId: string, userId: string, id: string, dto: ExternalJobActionDto) {
    return this.transaction(tenantId, userId, 'workorders.external', async tx => {
      const job = await tx.workshopExternalJob.findFirst({ where: { id, tenantId } });
      if (!job) throw new NotFoundException('Servicio externo no encontrado.');
      const ticket = await this.ticket(tx, tenantId, job.ticketId);
      const status = dto.action === 'RETURN' ? 'RETURNED' : 'CANCELLED';
      if (job.status === status) return job;
      if (job.status !== 'SENT') throw new BadRequestException('Este servicio externo ya fue finalizado.');
      if (dto.action === 'CANCEL' && ticket.salesOrderId) throw new BadRequestException('El servicio ya fue facturado. Registra su retorno y gestiona la nota de crédito correspondiente.');
      const result = await tx.workshopExternalJob.update({ where: { id }, data: { status, returnedAt: dto.action === 'RETURN' ? new Date() : null, notes: dto.notes.trim() } });
      if (dto.action === 'CANCEL') {
        const expense = await tx.workshopExpense.findUniqueOrThrow({ where: { id: job.expenseId } });
        if (expense.status === 'PAID') throw new BadRequestException('El proveedor ya fue pagado. Registra el retorno del servicio o gestiona su devolución antes de cancelar.');
        await tx.workshopExpense.update({ where: { id: job.expenseId }, data: { status: 'VOID', voidReason: dto.notes.trim() } });
      }
      await this.log(tx, tenantId, userId, 'WORKSHOP_EXTERNAL_' + status, id, job, result);
      return result;
    });
  }

  warranties(tenantId: string) {
    return this.db.workshopWarranty.findMany({ where: { tenantId }, include: { ticket: { select: ticketSummary }, claims: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } });
  }
  createWarranty(tenantId: string, userId: string, dto: CreateWarrantyDto) {
    return this.transaction(tenantId, userId, 'workorders.warranty', async tx => {
      const ticket = await this.ticket(tx, tenantId, dto.ticketId);
      const invoice = ticket.salesOrder?.invoice;
      const line = ticket.lines.find(line => line.id === dto.ticketLineId && line.approvalStatus === 'APPROVED');
      if (ticket.status !== 'DELIVERED' || !validInvoice(invoice) || !line || (line.type === 'PART' && !line.consumedQuantity.gt(0))) throw new BadRequestException('La garantía requiere un trabajo entregado y facturado de esta orden.');
      if (!dto.expiresAt && dto.mileageLimit === undefined) throw new BadRequestException('Indica vencimiento por fecha o kilometraje.');
      if (dto.expiresAt && new Date(dto.expiresAt) < new Date(dto.startsAt)) throw new BadRequestException('El vencimiento debe ser posterior al inicio.');
      const result = await tx.workshopWarranty.create({ data: { tenantId, ticketId: ticket.id, ticketLineId: line.id, invoiceId: invoice!.id, type: line.type === 'PART' ? 'PART' : 'SERVICE', description: line.description, startsAt: new Date(dto.startsAt), expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, mileageLimit: dto.mileageLimit, conditions: dto.conditions.trim(), createdById: userId } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_WARRANTY_CREATED', result.id, null, result);
      return result;
    });
  }
  createClaim(tenantId: string, userId: string, warrantyId: string, dto: CreateWarrantyClaimDto) {
    return this.transaction(tenantId, userId, 'workorders.warranty', async tx => {
      const warranty = await tx.workshopWarranty.findFirst({ where: { id: warrantyId, tenantId } });
      if (!warranty) throw new NotFoundException('Garantía no encontrada.');
      // Even expired claims are recorded; acceptance checks coverage separately.
      const result = await tx.workshopWarrantyClaim.create({ data: { warrantyId, complaint: dto.complaint.trim(), mileage: dto.mileage, createdById: userId } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_WARRANTY_CLAIM_OPENED', result.id, null, result);
      return result;
    });
  }
  resolveClaim(tenantId: string, userId: string, id: string, dto: ResolveWarrantyClaimDto) {
    return this.transaction(tenantId, userId, 'workorders.warranty', async tx => {
      const claim = await tx.workshopWarrantyClaim.findFirst({ where: { id, warranty: { tenantId } }, include: { warranty: { include: { ticket: true } } } });
      if (!claim) throw new NotFoundException('Reclamo no encontrado.');
      if (!((claim.status === 'OPEN' && ['ACCEPTED', 'REJECTED'].includes(dto.status)) || (claim.status === 'ACCEPTED' && dto.status === 'COMPLETED'))) throw new BadRequestException('Transición de reclamo no permitida.');
      const warranty = claim.warranty;
      if (dto.status === 'ACCEPTED' && (claim.createdAt < warranty.startsAt || (warranty.expiresAt && claim.createdAt > warranty.expiresAt) || (warranty.mileageLimit !== null && claim.mileage > warranty.mileageLimit))) throw new BadRequestException('El reclamo está fuera de la cobertura registrada.');
      const repairTicketId = dto.repairTicketId || claim.repairTicketId;
      if (dto.status !== 'REJECTED') {
        if (!repairTicketId || repairTicketId === warranty.ticketId) throw new BadRequestException('Vincula una nueva orden de reparación por garantía.');
        const repair = await this.ticket(tx, tenantId, repairTicketId);
        if (repair.vehicleId !== warranty.ticket.vehicleId || repair.customerId !== warranty.ticket.customerId || repair.status === 'CANCELLED') throw new BadRequestException('La reparación debe pertenecer al vehículo y cliente originales.');
        if (dto.status === 'COMPLETED' && repair.status !== 'DELIVERED') throw new BadRequestException('Entrega la reparación de garantía antes de cerrar el reclamo.');
      }
      const result = await tx.workshopWarrantyClaim.update({ where: { id }, data: { status: dto.status, resolution: dto.resolution.trim(), repairTicketId, resolvedAt: dto.status === 'ACCEPTED' ? null : new Date() } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_WARRANTY_CLAIM_' + dto.status, id, claim, result);
      return result;
    });
  }
  async maintenance(tenantId: string) {
    const items = await this.db.workshopMaintenance.findMany({ where: { tenantId }, include: { vehicle: { include: { customer: { select: { id: true, name: true, email: true, phone: true } } } } }, orderBy: { dueAt: 'asc' } });
    const now = Date.now();
    return items.map(item => ({ ...item, due: item.status === 'SCHEDULED' && Boolean((item.dueAt && item.dueAt.getTime() <= now) || (item.dueMileage !== null && item.vehicle.mileage !== null && item.vehicle.mileage >= item.dueMileage)), upcoming: item.status === 'SCHEDULED' && Boolean((item.dueAt && item.dueAt.getTime() <= now + 7 * 86400000) || (item.dueMileage !== null && item.vehicle.mileage !== null && item.vehicle.mileage >= item.dueMileage - 500)) }));
  }
  createMaintenance(tenantId: string, userId: string, dto: CreateMaintenanceDto) {
    return this.transaction(tenantId, userId, 'vehicles.maintenance', async tx => {
      const vehicle = await tx.workshopVehicle.findFirst({ where: { id: dto.vehicleId, tenantId } });
      if (!vehicle) throw new NotFoundException('Vehículo no encontrado.');
      if (!dto.dueAt && dto.dueMileage === undefined) throw new BadRequestException('Indica fecha, kilometraje o ambos para el próximo mantenimiento.');
      if (dto.originTicketId) {
        const ticket = await this.ticket(tx, tenantId, dto.originTicketId);
        if (ticket.vehicleId !== vehicle.id) throw new BadRequestException('La orden de origen pertenece a otro vehículo.');
      }
      const result = await tx.workshopMaintenance.create({ data: { tenantId, vehicleId: vehicle.id, originTicketId: dto.originTicketId, title: dto.title.trim(), dueAt: dto.dueAt ? new Date(dto.dueAt) : null, dueMileage: dto.dueMileage, notes: dto.notes?.trim(), createdById: userId } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_MAINTENANCE_SCHEDULED', result.id, null, result);
      return result;
    });
  }
  maintenanceAction(tenantId: string, userId: string, id: string, dto: MaintenanceActionDto) {
    return this.transaction(tenantId, userId, 'vehicles.maintenance', async tx => {
      const item = await tx.workshopMaintenance.findFirst({ where: { id, tenantId } });
      if (!item) throw new NotFoundException('Mantenimiento no encontrado.');
      if (item.status !== 'SCHEDULED') throw new BadRequestException('Este recordatorio ya fue cerrado.');
      if (dto.action === 'COMPLETE') {
        if (!dto.completedTicketId) throw new BadRequestException('Selecciona la orden que realizó el mantenimiento.');
        const ticket = await this.ticket(tx, tenantId, dto.completedTicketId);
        if (ticket.vehicleId !== item.vehicleId || ticket.status !== 'DELIVERED' || ticket.deliveredAt! < item.createdAt) throw new BadRequestException('El mantenimiento requiere una orden entregada del mismo vehículo, posterior al recordatorio.');
      }
      const result = await tx.workshopMaintenance.update({ where: { id }, data: { status: dto.action === 'COMPLETE' ? 'COMPLETED' : 'CANCELLED', completedAt: dto.action === 'COMPLETE' ? new Date() : null, completedTicketId: dto.action === 'COMPLETE' ? dto.completedTicketId : null, notes: dto.notes.trim() } });
      await this.log(tx, tenantId, userId, 'WORKSHOP_MAINTENANCE_' + result.status, id, item, result);
      return result;
    });
  }
}
