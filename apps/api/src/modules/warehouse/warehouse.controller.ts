import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@qorvex/database';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateWarehouseProductDto, UpdateWarehouseProductDto } from './dto/warehouse-product.dto';
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

  @Get('products')
  findProducts(@TenantId() tenantId: string) {
    return this.warehouseService.findProducts(tenantId);
  }

  @Post('products')
  createProduct(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWarehouseProductDto,
  ) {
    return this.warehouseService.createProduct(tenantId, user.id, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseProductDto,
  ) {
    return this.warehouseService.updateProduct(tenantId, user.id, id, dto);
  }

  @Delete('products/:id')
  removeProduct(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.warehouseService.removeProduct(tenantId, user.id, id);
  }

  @Get('movements')
  findMovements(@TenantId() tenantId: string) {
    return this.warehouseService.findMovements(tenantId);
  }
}
