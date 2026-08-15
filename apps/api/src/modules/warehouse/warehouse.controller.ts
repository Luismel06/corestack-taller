import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@qorvex/database';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { WarehouseService } from './warehouse.service';

@Controller('warehouse')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@Roles(Role.ACCOUNTANT, Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('stock')
  findStock(@TenantId() tenantId: string) {
    return this.warehouseService.findStock(tenantId);
  }

  @Get('movements')
  findMovements(@TenantId() tenantId: string) {
    return this.warehouseService.findMovements(tenantId);
  }
}
