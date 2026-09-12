import { Body, Controller, Get, Param, Patch, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { userPermissions } from '../../common/authorization';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkshopSupportService } from './workshop-support.service';
import { CreateAdvanceDto, RefundAdvanceDto, CreateExpenseDto, ExpenseActionDto, CreateExternalJobDto, ExternalJobActionDto, CreateWarrantyDto, CreateWarrantyClaimDto, ResolveWarrantyClaimDto, CreateMaintenanceDto, MaintenanceActionDto } from './dto/workshop-support.dto';

@Controller('workshop-support')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
export class WorkshopSupportController {
  constructor(private readonly service: WorkshopSupportService, private readonly db: PrismaService) {}
  @Get('options')
  async options(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    const p = userPermissions(user, tenantId);
    if (!['cash.advances','cash.refund_advances','payables.expenses','payables.view','payables.pay','workorders.external','workorders.warranty','vehicles.maintenance','reports.financial'].some(key => p[key])) throw new ForbiddenException();
    const [tickets, suppliers, vehicles, sessions] = await Promise.all([
      this.db.workshopTicket.findMany({ where: { tenantId }, select: { id: true, ticketNumber: true, status: true, vehicleId: true, salesOrderId: true, lines: { select: { id: true, description: true, type: true, approvalStatus: true } }, customer: { select: { name: true } }, vehicle: { select: { licensePlate: true } } }, orderBy: { createdAt: 'desc' } }),
      this.db.supplier.findMany({ where: { tenantId }, select: { id: true, commercialName: true } }),
      this.db.workshopVehicle.findMany({ where: { tenantId }, select: { id: true, licensePlate: true, make: true, model: true, mileage: true } }),
      this.db.cashSession.findMany({ where: { tenantId, status: 'OPEN', ...(p['cash.refund_advances'] || p['payables.pay'] ? {} : { openedById: user.id }) }, select: { id: true, openedById: true, cashRegister: { select: { name: true } } } }),
    ]);
    return { tickets, suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.commercialName })), vehicles, sessions };
  }

  @Get('advances')
  @RequirePermissions('cash.advances')
  advances(@TenantId() tenantId: string) {
    return this.service.advances(tenantId);
  }


  @Post('advances')
  @RequirePermissions('cash.advances')
  receiveAdvance(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAdvanceDto) {
    return this.service.receiveAdvance(tenantId, user.id, dto);
  }


  @Post('advances/:id/refund')
  @RequirePermissions('cash.refund_advances')
  refundAdvance(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RefundAdvanceDto) {
    return this.service.refundAdvance(tenantId, user.id, id, dto);
  }


  @Get('expenses')
  @RequirePermissions('payables.view')
  expenses(@TenantId() tenantId: string) {
    return this.service.expenses(tenantId);
  }


  @Post('expenses')
  @RequirePermissions('payables.expenses')
  createExpense(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.service.createExpense(tenantId, user.id, dto);
  }


  @Patch('expenses/:id')
  @RequirePermissions('payables.view')
  expenseAction(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ExpenseActionDto) {
    return this.service.expenseAction(tenantId, user.id, id, dto);
  }


  @Get('external-jobs')
  @RequirePermissions('workorders.external')
  externalJobs(@TenantId() tenantId: string) {
    return this.service.externalJobs(tenantId);
  }


  @Post('external-jobs')
  @RequirePermissions('workorders.external')
  createExternalJob(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExternalJobDto) {
    return this.service.createExternalJob(tenantId, user.id, dto);
  }


  @Patch('external-jobs/:id')
  @RequirePermissions('workorders.external')
  externalAction(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ExternalJobActionDto) {
    return this.service.externalAction(tenantId, user.id, id, dto);
  }


  @Get('warranties')
  @RequirePermissions('workorders.warranty')
  warranties(@TenantId() tenantId: string) {
    return this.service.warranties(tenantId);
  }


  @Post('warranties')
  @RequirePermissions('workorders.warranty')
  createWarranty(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWarrantyDto) {
    return this.service.createWarranty(tenantId, user.id, dto);
  }


  @Post('warranties/:id/claims')
  @RequirePermissions('workorders.warranty')
  createClaim(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateWarrantyClaimDto) {
    return this.service.createClaim(tenantId, user.id, id, dto);
  }


  @Patch('claims/:id')
  @RequirePermissions('workorders.warranty')
  resolveClaim(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResolveWarrantyClaimDto) {
    return this.service.resolveClaim(tenantId, user.id, id, dto);
  }


  @Get('maintenance')
  @RequirePermissions('vehicles.maintenance')
  maintenance(@TenantId() tenantId: string) {
    return this.service.maintenance(tenantId);
  }


  @Post('maintenance')
  @RequirePermissions('vehicles.maintenance')
  createMaintenance(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMaintenanceDto) {
    return this.service.createMaintenance(tenantId, user.id, dto);
  }


  @Patch('maintenance/:id')
  @RequirePermissions('vehicles.maintenance')
  maintenanceAction(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MaintenanceActionDto) {
    return this.service.maintenanceAction(tenantId, user.id, id, dto);
  }

}

