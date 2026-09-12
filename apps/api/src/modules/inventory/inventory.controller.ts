import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@qorvex/database';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@RequirePermissions('inventory.view')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('movements')
  findMovements(@TenantId() tenantId: string) {
    return this.inventoryService.findMovements(tenantId);
  }

  @Post('movements')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('inventory.adjust')
  createMovement(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInventoryMovementDto,
  ) {
    return this.inventoryService.createMovement(tenantId, user.id, dto);
  }
}
