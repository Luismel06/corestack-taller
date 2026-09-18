import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { WorkshopAppointmentStatus, WorkshopTicketStatus } from '@qorvex/database';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import {
  CreateWorkshopTicketDto,
  CreateWorkshopChangeOrderDto,
  CreateWorkshopTaskDto,
  CreateWorkshopServiceDto,
  CreateWorkshopAppointmentDto,
  CreateWorkshopReceptionDto,
  RespondWorkshopApprovalDto,
  RespondWorkshopChangeOrderDto,
  SendWorkshopTicketToCashierDto,
  CreateWorkshopVehicleDto,
  UpdateWorkshopTaskDto,
  UpdateWorkshopTicketDto,
  UpdateWorkshopServiceDto,
  UpdateWorkshopAppointmentDto,
  UpdateWorkshopReceptionDto,
  SaveWorkshopQualityCheckDto,
  CreateWorkshopDeliveryDto,
  SaveWorkshopInspectionDto,
  UpdateWorkshopVehicleDto,
  WorkshopPartMovementDto,
} from './dto/workshop.dto';
import { WorkshopService } from './workshop.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { requirePermissions } from '../../common/authorization';

@Controller('workshop')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@RequirePermissions('workorders.view')
export class WorkshopController {
  constructor(private readonly workshop: WorkshopService) {}

  @Post('tickets/:id/parts/:lineId/:action')
  @RequirePermissions('inventory.workshop_parts')
  movePart(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Param('action') action: string,
    @Body() dto: WorkshopPartMovementDto,
  ) {
    return this.workshop.movePart(tenantId, user.id, id, lineId, action, dto);
  }

  @Get('overview')
  overview(@TenantId() tenantId: string) {
    return this.workshop.overview(tenantId);
  }
  @Get('mechanics')
  mechanics(@TenantId() tenantId: string) {
    return this.workshop.mechanics(tenantId);
  }
  @Get('services')
  services(@TenantId() tenantId: string, @Query('includeInactive') includeInactive?: string) {
    return this.workshop.findServices(tenantId, includeInactive === 'true');
  }
  @Post('services')
  @RequirePermissions('services.manage')
  createService(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkshopServiceDto,
  ) {
    return this.workshop.createService(tenantId, user.id, dto);
  }
  @Patch('services/:id')
  @RequirePermissions('services.manage')
  updateService(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopServiceDto,
  ) {
    return this.workshop.updateService(tenantId, user.id, id, dto);
  }
  @Get('vehicles')
  @RequirePermissions('vehicles.view')
  vehicles(@TenantId() tenantId: string, @Query('customerId') customerId?: string) {
    return this.workshop.findVehicles(tenantId, customerId);
  }

  @Get('appointments')
  @RequirePermissions('appointments.manage')
  appointments(
    @TenantId() tenantId: string,
    @Query('status') status?: WorkshopAppointmentStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.workshop.findAppointments(tenantId, status, from, to);
  }

  @Post('appointments')
  @RequirePermissions('appointments.manage')
  createAppointment(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkshopAppointmentDto,
  ) {
    return this.workshop.createAppointment(tenantId, user.id, dto);
  }

  @Patch('appointments/:id')
  @RequirePermissions('appointments.manage')
  updateAppointment(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopAppointmentDto,
  ) {
    return this.workshop.updateAppointment(tenantId, user.id, id, dto);
  }

  @Post('appointments/:id/convert-to-reception')
  @RequirePermissions('reception.manage')
  convertAppointmentToReception(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workshop.convertAppointmentToReception(tenantId, user.id, id);
  }
  @Post('vehicles')
  @RequirePermissions('vehicles.manage')
  createVehicle(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkshopVehicleDto,
  ) {
    return this.workshop.createVehicle(tenantId, user.id, dto);
  }
  @Get('vehicles/:id/history')
  @RequirePermissions('vehicles.view')
  vehicleHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workshop.vehicleHistory(tenantId, id);
  }
  @Patch('vehicles/:id')
  @RequirePermissions('vehicles.manage')
  updateVehicle(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopVehicleDto,
  ) {
    return this.workshop.updateVehicle(tenantId, user.id, id, dto);
  }
  @Get('tickets')
  tickets(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: WorkshopTicketStatus,
  ) {
    return this.workshop.findTickets(tenantId, user, status);
  }
  @Post('tickets')
  @RequirePermissions('workorders.create')
  createTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkshopTicketDto,
  ) {
    if (dto.lines?.length) requirePermissions(user, tenantId, 'quotes.create');
    if (dto.mechanicIds?.length) requirePermissions(user, tenantId, 'workorders.assign');
    return this.workshop.createTicket(tenantId, user.id, dto);
  }

  @Post('tickets/:id/reception')
  @RequirePermissions('reception.manage')
  createReception(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateWorkshopReceptionDto,
  ) {
    return this.workshop.createReception(tenantId, user.id, id, dto);
  }

  @Post('reception-images')
  @RequirePermissions('reception.manage')
  @UseInterceptors(FilesInterceptor('files', 2))
  uploadReceptionImages(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles()
    files: Array<{ originalname: string; mimetype?: string; buffer: Buffer; size: number }>,
  ) {
    return this.workshop.uploadReceptionImages(tenantId, user.id, files);
  }

  @Patch('tickets/:id/reception')
  @RequirePermissions('reception.manage')
  updateReception(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopReceptionDto,
  ) {
    return this.workshop.updateReception(tenantId, user.id, id, dto);
  }

  @Post('tickets/:id/quality-check')
  @RequirePermissions('workorders.quality')
  saveQualityCheck(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveWorkshopQualityCheckDto,
  ) {
    return this.workshop.saveQualityCheck(tenantId, user.id, id, dto);
  }

  @Post('tickets/:id/delivery')
  @RequirePermissions('workorders.deliver')
  createDelivery(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateWorkshopDeliveryDto,
  ) {
    return this.workshop.createDelivery(tenantId, user.id, id, dto);
  }

  @Post('tickets/:id/inspection')
  @RequirePermissions('workorders.diagnose')
  saveInspection(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveWorkshopInspectionDto,
  ) {
    return this.workshop.saveInspection(tenantId, user.id, id, dto);
  }
  @Patch('tickets/:id')
  @RequirePermissions('workorders.view')
  updateTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopTicketDto,
  ) {
    if (dto.status)
      requirePermissions(
        user,
        tenantId,
        dto.status === 'CANCELLED' ? 'workorders.cancel' : 'workorders.change_status',
      );
    if (dto.status === 'AWAITING_APPROVAL') requirePermissions(user, tenantId, 'quotes.create');
    if (dto.lines !== undefined) requirePermissions(user, tenantId, 'quotes.create');
    if (dto.areaFindings !== undefined) requirePermissions(user, tenantId, 'quotes.create');
    if (dto.mechanicIds !== undefined) requirePermissions(user, tenantId, 'workorders.assign');
    if (dto.diagnosis !== undefined) requirePermissions(user, tenantId, 'workorders.diagnose');
    if (
      Object.keys(dto).some(
        (key) => !['status', 'lines', 'areaFindings', 'mechanicIds', 'diagnosis'].includes(key),
      )
    )
      requirePermissions(user, tenantId, 'workorders.edit');
    return this.workshop.updateTicket(tenantId, user.id, id, dto);
  }

  @Delete('tickets/:id')
  @RequirePermissions('workorders.cancel')
  deleteTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workshop.deleteTicket(tenantId, user.id, id);
  }

  @Post('tickets/:id/quote/revise')
  @RequirePermissions('quotes.create')
  reviseQuote(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workshop.reviseQuote(tenantId, user.id, id);
  }

  @Post('tickets/:id/approval')
  @RequirePermissions('quotes.record_approval')
  respondApproval(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RespondWorkshopApprovalDto,
  ) {
    return this.workshop.respondApproval(tenantId, user.id, id, dto);
  }

  @Get('tickets/:id/change-orders')
  changeOrders(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workshop.findChangeOrders(tenantId, id);
  }

  @Post('tickets/:id/change-orders')
  @RequirePermissions('quotes.create')
  createChangeOrder(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateWorkshopChangeOrderDto,
  ) {
    return this.workshop.createChangeOrder(tenantId, user.id, id, dto);
  }

  @Post('tickets/:ticketId/change-orders/:changeOrderId/respond')
  @RequirePermissions('quotes.record_approval')
  respondChangeOrder(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId') ticketId: string,
    @Param('changeOrderId') changeOrderId: string,
    @Body() dto: RespondWorkshopChangeOrderDto,
  ) {
    return this.workshop.respondChangeOrder(tenantId, user.id, ticketId, changeOrderId, dto);
  }

  @Post('tickets/:id/tasks')
  @RequirePermissions('workorders.assign')
  createTask(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateWorkshopTaskDto,
  ) {
    return this.workshop.createTask(tenantId, user.id, id, dto);
  }

  @Patch('tickets/:ticketId/tasks/:taskId')
  @RequirePermissions('workorders.view')
  updateTask(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId') ticketId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateWorkshopTaskDto,
  ) {
    if (dto.status)
      requirePermissions(
        user,
        tenantId,
        dto.status === 'CANCELLED' ? 'tasks.cancel' : 'tasks.progress',
      );
    if (Object.keys(dto).some((key) => !['status', 'cancellationReason'].includes(key)))
      requirePermissions(user, tenantId, 'workorders.assign');
    return this.workshop.updateTask(tenantId, user, ticketId, taskId, dto);
  }

  // El asesor prepara la orden para cobro; el cajero es quien finalmente
  // emite el comprobante y registra el pago dentro de una sesión de Caja.
  @Post('tickets/:id/send-to-cashier')
  @RequirePermissions('workorders.send_to_cashier')
  sendToCashier(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendWorkshopTicketToCashierDto,
  ) {
    return this.workshop.sendToCashier(tenantId, user.id, id, dto);
  }
}
