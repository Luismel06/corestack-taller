import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ProductInventoryDestination,
  ProductStatus,
  ProductUnit,
  TaxCategory,
  WarehouseMovementType,
} from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseProductDto, UpdateWarehouseProductDto } from './dto/warehouse-product.dto';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  findStock(tenantId: string) {
    return this.prisma.warehouseStock.findMany({
      where: { tenantId },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ quantity: 'desc' }, { product: { name: 'asc' } }],
    });
  }

  findProducts(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, inventoryDestination: ProductInventoryDestination.WAREHOUSE },
      include: {
        warehouseStocks: {
          where: { tenantId },
          select: { id: true, quantity: true, unitCost: true, updatedAt: true },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createProduct(tenantId: string, userId: string, dto: CreateWarehouseProductDto) {
    const sku = dto.sku?.trim() || null;
    const barcode = dto.barcode?.trim() || null;
    await this.ensureUniqueCodes(tenantId, sku, barcode);

    const initialQuantity = dto.initialQuantity ?? 0;
    const cost = dto.cost === undefined ? null : new Prisma.Decimal(dto.cost);
    const salePrice = new Prisma.Decimal(dto.salePrice ?? 0);
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          sku,
          barcode,
          brand: dto.brand?.trim() || null,
          description: dto.description?.trim() || null,
          unit: dto.unit ?? ProductUnit.UNIT,
          price: salePrice,
          salePrice,
          cost,
          taxCategory: dto.taxCategory ?? TaxCategory.ITBIS_18,
          taxRate: dto.taxRate ?? 0.18,
          trackInventory: false,
          inventoryDestination: ProductInventoryDestination.WAREHOUSE,
          stock: 0,
          minStock: 0,
          status: ProductStatus.ACTIVE,
        },
      });

      if (initialQuantity > 0) {
        await tx.warehouseStock.create({
          data: { tenantId, productId: created.id, quantity: initialQuantity, unitCost: cost },
        });
        await tx.warehouseMovement.create({
          data: {
            tenantId,
            productId: created.id,
            type: WarehouseMovementType.ADJUSTMENT_IN,
            quantity: initialQuantity,
            previousQuantity: 0,
            newQuantity: initialQuantity,
            unitCost: cost,
            reason: 'Existencia inicial de producto de almacén',
            reference: `WAREHOUSE-PRODUCT-${created.id}`,
            createdById: userId,
          },
        });
      }

      return created;
    });

    return product;
  }

  async updateProduct(
    tenantId: string,
    _userId: string,
    id: string,
    dto: UpdateWarehouseProductDto,
  ) {
    await this.getWarehouseProduct(tenantId, id);
    const sku = dto.sku === undefined ? undefined : dto.sku.trim() || null;
    const barcode = dto.barcode === undefined ? undefined : dto.barcode.trim() || null;
    await this.ensureUniqueCodes(tenantId, sku, barcode, id);

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        sku,
        barcode,
        brand: dto.brand === undefined ? undefined : dto.brand.trim() || null,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        unit: dto.unit,
        cost: dto.cost === undefined ? undefined : new Prisma.Decimal(dto.cost),
        price: dto.salePrice === undefined ? undefined : new Prisma.Decimal(dto.salePrice),
        salePrice: dto.salePrice === undefined ? undefined : new Prisma.Decimal(dto.salePrice),
        taxCategory: dto.taxCategory,
        taxRate: dto.taxRate,
      },
    });
  }

  async removeProduct(tenantId: string, _userId: string, id: string) {
    await this.getWarehouseProduct(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.INACTIVE },
    });
  }

  findMovements(tenantId: string) {
    return this.prisma.warehouseMovement.findMany({
      where: { tenantId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            unit: true,
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async getWarehouseProduct(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, inventoryDestination: ProductInventoryDestination.WAREHOUSE },
    });
    if (!product) {
      throw new NotFoundException('Warehouse product not found for tenant.');
    }
    return product;
  }

  private async ensureUniqueCodes(
    tenantId: string,
    sku: string | null | undefined,
    barcode: string | null | undefined,
    excludeId?: string,
  ) {
    const filters = [...(sku ? [{ sku }] : []), ...(barcode ? [{ barcode }] : [])];
    if (!filters.length) return;

    const existing = await this.prisma.product.findFirst({
      where: { tenantId, OR: filters, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, sku: true, barcode: true },
    });
    if (existing) {
      throw new ConflictException('Product code already exists for this tenant.');
    }
  }
}
