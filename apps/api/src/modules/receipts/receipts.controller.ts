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
  CreateReceiptDto,
  ListReceiptsQueryDto,
  ReceiptReasonDto,
  UpdateReceiptDto,
} from './dto/receipt.dto';
import { ReceiptsService } from './receipts.service';
import { requireReceiptPricingPermission } from './receipt-permissions';

const receiptRoles: Role[] = [
  Role.ACCOUNTANT,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.QORVEX_SUPER_ADMIN,
];
const receiptAdminRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN];

@Controller('receipts')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@Roles(...receiptRoles)
@RequirePermissions('inventory.view')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: ListReceiptsQueryDto) {
    return this.receiptsService.findAll(tenantId, query);
  }

  @Post()
  @RequirePermissions('inventory.receive')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReceiptDto,
  ) {
    requireReceiptPricingPermission(user, tenantId, dto.items);
    return this.receiptsService.create(tenantId, user.id, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.receiptsService.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.receive')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReceiptDto,
  ) {
    requireReceiptPricingPermission(user, tenantId, dto.items);
    return this.receiptsService.update(tenantId, user.id, id, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions('inventory.receive')
  async confirm(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const receipt = await this.receiptsService.findOne(tenantId, id);
    requireReceiptPricingPermission(user, tenantId, receipt.items);
    return this.receiptsService.confirm(tenantId, user.id, id, user);
  }

  @Post(':id/cancel')
  @Roles(...receiptAdminRoles)
  @RequirePermissions('inventory.reverse_receipt')
  cancel(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReceiptReasonDto,
  ) {
    return this.receiptsService.cancel(tenantId, user.id, id, dto.reason);
  }

  @Post(':id/reverse')
  @Roles(...receiptAdminRoles)
  @RequirePermissions('inventory.reverse_receipt')
  reverse(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReceiptReasonDto,
  ) {
    return this.receiptsService.reverse(tenantId, user.id, id, dto.reason);
  }
}
