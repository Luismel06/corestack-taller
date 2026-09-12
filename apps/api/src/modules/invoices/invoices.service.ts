import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InventoryMovementType,
  InvoiceDocumentType,
  InvoiceFiscalStatus,
  InvoiceStatus,
  Prisma,
  ProductStatus,
  ProductUnit,
} from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

const inventoryAffectingStatuses: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PAID,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PENDING_ECF,
  InvoiceStatus.ACCEPTED,
];

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        customer: true,
        items: true,
        issuedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateInvoiceDto) {
    if (!dto.items.length) {
      throw new BadRequestException('Invoice must include at least one item.');
    }

    if (dto.customerId) {
      await this.ensureCustomer(tenantId, dto.customerId);
    }

    if (dto.items.some((item) => !item.productId)) {
      throw new BadRequestException(
        'Invoice items must reference products so totals are recalculated from database.',
      );
    }

    const productIds = dto.items.map((item) => item.productId!);
    const products = await this.getProductsForInvoice(tenantId, productIds);
    const items = dto.items.map((item) => {
      const product = products.get(item.productId!);

      if (!product) {
        throw new NotFoundException('One or more invoice products do not belong to tenant.');
      }

      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = product.salePrice.gt(0) ? product.salePrice : product.price;
      const subtotal = quantity.mul(unitPrice).toDecimalPlaces(2);
      const taxTotal = subtotal.mul(product.taxRate).toDecimalPlaces(2);

      return {
        product,
        quantity,
        unitPrice,
        subtotal,
        taxTotal,
        total: subtotal.add(taxTotal).toDecimalPlaces(2),
      };
    });
    const subtotal = items
      .reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
    const taxTotal = items
      .reduce((sum, item) => sum.add(item.taxTotal), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
    const total = items
      .reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
    const status = dto.status ?? InvoiceStatus.DRAFT;
    this.assertDraftStatus(status);
    const shouldAffectInventory = inventoryAffectingStatuses.includes(status);

    const invoice = await this.prisma.$transaction(async (tx) => {
      if (shouldAffectInventory) {
        for (const item of items) {
          if (!item.product.trackInventory) {
            continue;
          }

          const quantity = item.quantity.toNumber();

          if (requiresWholeQuantity(item.product.unit) && !Number.isInteger(quantity)) {
            throw new BadRequestException('Tracked inventory products require whole quantities.');
          }

          if (item.product.stock < quantity) {
            throw new BadRequestException(`Insufficient stock for ${item.product.name}.`);
          }
        }
      }

      const paidAmount = status === InvoiceStatus.PAID ? total : new Prisma.Decimal(0);
      const createdInvoice = await tx.invoice.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          documentType: dto.documentType ?? InvoiceDocumentType.CONSUMER_02,
          invoiceNumber: dto.invoiceNumber ?? `RIV-MAN-${Date.now()}`,
          status,
          fiscalStatus: InvoiceFiscalStatus.NOT_APPLICABLE,
          subtotal,
          taxTotal,
          discountTotal: 0,
          total,
          paidAmount,
          balance: total.sub(paidAmount),
          paymentMethod: dto.paymentMethod,
          issuedById: userId,
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          items: {
            create: items.map((item) => ({
              productId: item.product.id,
              sku: item.product.sku,
              barcode: item.product.barcode,
              description: item.product.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountTotal: 0,
              taxRate: item.product.taxRate,
              taxTotal: item.taxTotal,
              subtotal: item.subtotal,
              total: item.total,
            })),
          },
        },
        include: {
          customer: true,
          items: true,
        },
      });

      if (shouldAffectInventory) {
        for (const item of items) {
          if (!item.product.trackInventory) {
            continue;
          }

          const quantity = item.quantity.toNumber();
          const previousStock = item.product.stock;
          const newStock = previousStock - quantity;

          await tx.product.update({
            where: { id: item.product.id },
            data: { stock: newStock },
          });

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              productId: item.product.id,
              type: InventoryMovementType.SALE,
              quantity,
              previousStock,
              newStock,
              unitCost: item.product.cost,
              reason: 'Venta facturada',
              reference: createdInvoice.invoiceNumber,
              invoiceId: createdInvoice.id,
              createdById: userId,
            },
          });
        }
      }

      return createdInvoice;
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'INVOICE_CREATED',
      entity: 'Invoice',
      entityId: invoice.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        total: invoice.total.toString(),
      },
    });

    return invoice;
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        tenant: true,
        customer: true,
        items: true,
        payments: true,
        electronicDocument: true,
        issuedBy: {
          select: { id: true, name: true, email: true },
        },
        cashSession: {
          include: { cashRegister: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found for tenant.');
    }

    return invoice;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateInvoiceDto) {
    const current = await this.findOne(tenantId, id);
    this.assertDraftStatus(current.status);
    if (current.ncf || current.eNcf || current.cashSessionId) {
      throw new BadRequestException('Un comprobante emitido no se modifica como borrador.');
    }
    if (dto.status !== undefined) this.assertDraftStatus(dto.status);

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: dto.status,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'INVOICE_UPDATED',
      entity: 'Invoice',
      entityId: id,
      metadata: { fields: Object.keys(dto), status: invoice.status },
    });

    return invoice;
  }

  private assertDraftStatus(status: InvoiceStatus) {
    if (status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        'Este endpoint solo gestiona borradores. Emite y cobra desde POS y Caja.',
      );
    }
  }

  private async ensureCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for tenant.');
    }
  }

  private async getProductsForInvoice(tenantId: string, productIds: string[]) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        status: ProductStatus.ACTIVE,
        id: {
          in: productIds,
        },
      },
    });

    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException('One or more invoice products do not belong to tenant.');
    }

    return new Map(products.map((product) => [product.id, product]));
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
