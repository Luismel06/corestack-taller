import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}
