import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { requirePermissions } from '../../common/authorization';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@qorvex/database';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import type { UploadedProductImageFile } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@RequirePermissions('inventory.view')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query('q') q?: string) {
    return this.productsService.findAll(tenantId, q);
  }

  @Get('search')
  search(@TenantId() tenantId: string, @Query('q') q = '') {
    return this.productsService.search(tenantId, q);
  }

  @Get('barcode/:barcode')
  findByBarcode(@TenantId() tenantId: string, @Param('barcode') barcode: string) {
    return this.productsService.findByBarcode(tenantId, barcode);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('products.manage')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    if (dto.stock !== undefined && dto.stock !== 0)
      requirePermissions(user, tenantId, 'inventory.adjust');
    return this.productsService.create(tenantId, user.id, dto);
  }

  @Post('image')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermissions('products.manage')
  uploadImage(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedProductImageFile,
  ) {
    return this.productsService.uploadImage(tenantId, user.id, file);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productsService.findOne(tenantId, id);
  }

  @Post(':id/generate-barcode')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('products.manage')
  generateBarcode(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.productsService.generateBarcode(tenantId, user.id, id);
  }

  @Post(':id/label')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('products.manage')
  getLabel(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.productsService.getLabel(tenantId, user.id, id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('products.manage')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    // Even an apparently unchanged value can overwrite a concurrent stock movement.
    if (dto.stock !== undefined) requirePermissions(user, tenantId, 'inventory.adjust');
    return this.productsService.update(tenantId, user.id, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('products.manage')
  remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.productsService.remove(tenantId, user.id, id);
  }
}
