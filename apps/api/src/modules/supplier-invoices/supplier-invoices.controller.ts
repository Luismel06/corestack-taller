import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@qorvex/database';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import {
  CancelSupplierInvoiceDto,
  CancelSupplierPaymentDto,
  ConfirmSupplierInvoiceEntryDto,
  CreateSupplierInvoiceDto,
  ListSupplierInvoicesQueryDto,
  PayablesSummaryQueryDto,
  RegisterSupplierPaymentDto,
  UpdateSupplierInvoiceDto,
} from './dto/supplier-invoice.dto';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { requireReceiptPricingPermission } from '../receipts/receipt-permissions';

const accountingRoles: Role[] = [
  Role.ACCOUNTANT,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.QORVEX_SUPER_ADMIN,
];
const adminRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN];

@Controller('supplier-invoices')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@Roles(...accountingRoles)
@RequirePermissions('supplier_invoices.view')
export class SupplierInvoicesController {
  constructor(private readonly supplierInvoicesService: SupplierInvoicesService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: ListSupplierInvoicesQueryDto) {
    return this.supplierInvoicesService.findAll(tenantId, query);
  }

  @Get('payables/summary')
  @RequirePermissions('payables.view')
  getPayablesSummary(@TenantId() tenantId: string, @Query() query: PayablesSummaryQueryDto) {
    return this.supplierInvoicesService.getPayablesSummary(tenantId, query);
  }

  @Get('payables/invoices')
  @RequirePermissions('payables.view')
  getPayableInvoices(@TenantId() tenantId: string, @Query() query: ListSupplierInvoicesQueryDto) {
    return this.supplierInvoicesService.findAll(tenantId, query);
  }

  @Post()
  @RequirePermissions('supplier_invoices.manage')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplierInvoiceDto,
  ) {
    return this.supplierInvoicesService.create(tenantId, user.id, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.supplierInvoicesService.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('supplier_invoices.manage')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierInvoiceDto,
  ) {
    return this.supplierInvoicesService.update(tenantId, user.id, id, dto);
  }

  @Post(':id/confirm-entry')
  @RequirePermissions('supplier_invoices.manage', 'inventory.receive')
  confirmEntry(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmSupplierInvoiceEntryDto,
  ) {
    requireReceiptPricingPermission(user, tenantId, dto.items);
    return this.supplierInvoicesService.confirmEntry(tenantId, user.id, id, dto);
  }

  @Post(':id/cancel')
  @Roles(...adminRoles)
  @RequirePermissions('supplier_invoices.cancel')
  cancel(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelSupplierInvoiceDto,
  ) {
    return this.supplierInvoicesService.cancel(tenantId, user.id, id, dto.reason);
  }

  @Post(':id/payments')
  @RequirePermissions('payables.pay')
  registerPayment(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RegisterSupplierPaymentDto,
  ) {
    return this.supplierInvoicesService.registerPayment(tenantId, user.id, id, dto);
  }

  @Post(':id/payments/:paymentId/cancel')
  @Roles(...adminRoles)
  @RequirePermissions('payables.cancel_payment')
  cancelPayment(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: CancelSupplierPaymentDto,
  ) {
    return this.supplierInvoicesService.cancelPayment(tenantId, user.id, id, paymentId, dto);
  }
}
