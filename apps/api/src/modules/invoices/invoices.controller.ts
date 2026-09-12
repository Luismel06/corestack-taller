import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@qorvex/database';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@RequirePermissions('invoices.view')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.invoicesService.findAll(tenantId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('invoices.manage')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(tenantId, user.id, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Get(':id/receipt')
  @RequirePermissions('invoices.reprint')
  receipt(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('invoices.manage')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(tenantId, user.id, id, dto);
  }
}
