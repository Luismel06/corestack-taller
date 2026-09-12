import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, ProductUnit } from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findMovements(tenantId: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { tenantId },
      include: {
        product: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });
  }

  async createMovement(tenantId: string, userId: string, dto: CreateInventoryMovementDto) {
    if (dto.type.startsWith('WORK_ORDER_')) {
      throw new BadRequestException(
        'Los movimientos de taller deben registrarse desde la OT correspondiente.',
      );
    }
    const signedQuantity = this.getSignedQuantity(dto.type, dto.quantity);

    const movement = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Product" WHERE "id" = ${dto.productId} AND "tenantId" = ${tenantId} FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotFoundException('Product not found for tenant.');
      const product = await tx.product.findUniqueOrThrow({ where: { id: dto.productId } });
      if (requiresWholeQuantity(product.unit) && !Number.isInteger(dto.quantity)) {
        throw new BadRequestException('Product unit requires whole inventory quantities.');
      }
      const previousStock = product.stock;
      const newStock = previousStock + signedQuantity;

      if (newStock < 0) {
        throw new BadRequestException('Inventory movement would leave product stock below zero.');
      }
      if (newStock < product.reservedStock) {
        throw new BadRequestException(
          'El ajuste no puede utilizar existencias reservadas para otras órdenes.',
        );
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          type: dto.type,
          quantity: dto.quantity,
          previousStock,
          newStock,
          unitCost: product.cost,
          reason: dto.reason,
          reference: dto.reference,
          createdById: userId,
        },
      });

      await tx.product.update({
        where: { id: dto.productId },
        data: {
          stock: newStock,
        },
      });

      return movement;
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'INVENTORY_MOVEMENT_CREATED',
      entity: 'InventoryMovement',
      entityId: movement.id,
      metadata: {
        productId: dto.productId,
        type: dto.type,
        quantity: dto.quantity,
        reference: dto.reference,
      },
    });

    return movement;
  }

  private getSignedQuantity(type: InventoryMovementType, quantity: number) {
    const negativeMovementTypes: InventoryMovementType[] = [
      InventoryMovementType.OUTBOUND,
      InventoryMovementType.SALE,
      InventoryMovementType.ADJUSTMENT_OUT,
      InventoryMovementType.DAMAGE,
      InventoryMovementType.TRANSFER_OUT,
    ];

    if (negativeMovementTypes.includes(type)) {
      return -quantity;
    }

    return quantity;
  }
}

function requiresWholeQuantity(unit: ProductUnit) {
  const fractionalUnits: ProductUnit[] = [
    ProductUnit.METER,
    ProductUnit.FOOT,
    ProductUnit.YARD,
    ProductUnit.POUND,
  ];
  return !fractionalUnits.includes(unit);
}
