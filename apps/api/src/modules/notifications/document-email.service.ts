import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendService } from './resend.service';

type DocumentKind = 'QUOTATION' | 'WORKSHOP_QUOTE' | 'INVOICE';

@Injectable()
export class DocumentEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resend: ResendService,
  ) {}

  quotationActivity(tenantId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        OR: [
          {
            entity: 'SalesOrder',
            action: { in: ['DOCUMENT_EMAIL_SENT', 'DOCUMENT_EMAIL_FAILED'] },
          },
          {
            entity: 'WorkshopTicket',
            action: {
              in: [
                'DOCUMENT_EMAIL_SENT',
                'DOCUMENT_EMAIL_FAILED',
                'WORKSHOP_TICKET_APPROVAL_RECORDED',
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        entity: true,
        entityId: true,
        action: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  history(tenantId: string, kind: DocumentKind, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entity: this.entity(kind),
        entityId,
        action: { in: ['DOCUMENT_EMAIL_SENT', 'DOCUMENT_EMAIL_FAILED'] },
      },
      select: { id: true, action: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async sendQuotation(tenantId: string, userId: string, id: string, recipient: string) {
    const quotation = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId, destination: 'QUOTATION' },
      include: {
        tenant: true,
        customer: true,
        items: { orderBy: { description: 'asc' } },
        workshopTicket: { include: { vehicle: true } },
      },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada para esta empresa.');
    if (quotation.status === 'CANCELLED')
      throw new BadRequestException('No se puede enviar una cotización cancelada.');

    const clientName = quotation.customer?.name ?? quotation.clientName ?? 'Cliente';
    const vehicle = quotation.workshopTicket?.vehicle;
    const workshopName = quotation.tenant.commercialName ?? quotation.tenant.name;
    const subject = `Cotización ${quotation.orderNumber} · ${workshopName}`;
    const templateVariables = this.variables({
      workshopName,
      customerName: clientName,
      documentNumber: quotation.orderNumber,
      documentLabel: 'Cotización',
      vehicle: vehicle
        ? [vehicle.licensePlate, vehicle.make, vehicle.model].filter(Boolean).join(' · ')
        : '',
      subtotal: quotation.subtotal.toString(),
      taxTotal: quotation.taxTotal.toString(),
      discountTotal: quotation.discountTotal.toString(),
      total: quotation.total.toString(),
    });
    return this.deliver({
      tenantId,
      userId,
      kind: 'QUOTATION',
      entityId: quotation.id,
      documentNumber: quotation.orderNumber,
      recipient,
      subject,
      templateId: process.env.RESEND_QUOTATION_TEMPLATE_ID,
      templateVariables,
      html: this.renderHtml({
        workshop: quotation.tenant,
        customerName: clientName,
        documentLabel: 'Cotización',
        documentNumber: quotation.orderNumber,
        vehicle: templateVariables.vehicle,
        items: quotation.items,
        subtotal: quotation.subtotal,
        taxTotal: quotation.taxTotal,
        discountTotal: quotation.discountTotal,
        total: quotation.total,
        note: quotation.notes,
      }),
    });
  }

  async sendInvoice(tenantId: string, userId: string, id: string, recipient: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        tenant: true,
        customer: true,
        items: { orderBy: { description: 'asc' } },
        salesOrder: { include: { workshopTicket: { include: { vehicle: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada para esta empresa.');
    if (invoice.status === 'DRAFT')
      throw new BadRequestException('Emite la factura antes de enviarla al cliente.');
    if (['CANCELLED', 'VOID', 'VOIDED'].includes(invoice.status))
      throw new BadRequestException('No se puede enviar una factura cancelada o anulada.');

    const clientName = invoice.customer?.name ?? 'Consumidor final';
    const vehicle = invoice.salesOrder?.workshopTicket?.vehicle;
    const workshopName = invoice.tenant.commercialName ?? invoice.tenant.name;
    const subject = `Factura ${invoice.invoiceNumber} · ${workshopName}`;
    const templateVariables = this.variables({
      workshopName,
      customerName: clientName,
      documentNumber: invoice.invoiceNumber,
      documentLabel: 'Factura / comprobante',
      vehicle: vehicle
        ? [vehicle.licensePlate, vehicle.make, vehicle.model].filter(Boolean).join(' · ')
        : '',
      subtotal: invoice.subtotal.toString(),
      taxTotal: invoice.taxTotal.toString(),
      discountTotal: invoice.discountTotal.toString(),
      total: invoice.total.toString(),
      fiscalNumber: invoice.eNcf ?? invoice.ncf ?? '',
    });
    return this.deliver({
      tenantId,
      userId,
      kind: 'INVOICE',
      entityId: invoice.id,
      documentNumber: invoice.invoiceNumber,
      recipient,
      subject,
      templateId: process.env.RESEND_INVOICE_TEMPLATE_ID,
      templateVariables,
      html: this.renderHtml({
        workshop: invoice.tenant,
        customerName: clientName,
        documentLabel: 'Factura / comprobante',
        documentNumber: invoice.invoiceNumber,
        fiscalNumber: templateVariables.fiscalNumber,
        vehicle: templateVariables.vehicle,
        items: invoice.items,
        subtotal: invoice.subtotal,
        taxTotal: invoice.taxTotal,
        discountTotal: invoice.discountTotal,
        total: invoice.total,
      }),
    });
  }

  async sendWorkshopQuote(tenantId: string, userId: string, ticketId: string, recipient: string) {
    const ticket = await this.prisma.workshopTicket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        tenant: true,
        customer: true,
        vehicle: true,
        lines: { orderBy: { createdAt: 'asc' } },
        quoteVersions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!ticket) throw new NotFoundException('Orden de trabajo no encontrada para esta empresa.');
    const quote = ticket.quoteVersions[0];
    if (!quote)
      throw new BadRequestException('Genera la cotización de la orden antes de enviarla.');
    if (ticket.status === 'CANCELLED')
      throw new BadRequestException('No se puede enviar una orden cancelada.');

    const workshopName = ticket.tenant.commercialName ?? ticket.tenant.name;
    const documentNumber = `${ticket.ticketNumber}-V${quote.version}`;
    const vehicle = [ticket.vehicle.licensePlate, ticket.vehicle.make, ticket.vehicle.model]
      .filter(Boolean)
      .join(' · ');
    const snapshot = quote.snapshot as {
      lines?: Array<{
        description?: string;
        quantity?: string;
        unitPrice?: string;
        total?: string;
      }>;
    };
    const snapshotItems = Array.isArray(snapshot?.lines)
      ? snapshot.lines
          .filter((line) => line.description && line.quantity && line.unitPrice && line.total)
          .map((line) => ({
            description: line.description!,
            quantity: new Prisma.Decimal(line.quantity!),
            unitPrice: new Prisma.Decimal(line.unitPrice!),
            total: new Prisma.Decimal(line.total!),
          }))
      : [];
    const subtotal = quote.laborTotal.add(quote.partsTotal).toDecimalPlaces(2);
    const taxTotal = Prisma.Decimal.max(quote.total.sub(subtotal), 0).toDecimalPlaces(2);
    const templateVariables = this.variables({
      workshopName,
      customerName: ticket.customer.name,
      documentNumber,
      documentLabel: 'Cotización de taller',
      vehicle,
      subtotal: subtotal.toString(),
      taxTotal: taxTotal.toString(),
      discountTotal: '0',
      total: quote.total.toString(),
      ticketNumber: ticket.ticketNumber,
      quoteVersion: String(quote.version),
    });
    return this.deliver({
      tenantId,
      userId,
      kind: 'WORKSHOP_QUOTE',
      entityId: ticket.id,
      documentNumber,
      recipient,
      subject: `Cotización ${documentNumber} · ${workshopName}`,
      templateId: process.env.RESEND_QUOTATION_TEMPLATE_ID,
      templateVariables,
      html: this.renderHtml({
        workshop: ticket.tenant,
        customerName: ticket.customer.name,
        documentLabel: 'Cotización de taller',
        documentNumber,
        vehicle,
        items: snapshotItems.length ? snapshotItems : ticket.lines,
        subtotal,
        taxTotal,
        discountTotal: new Prisma.Decimal(0),
        total: quote.total,
        note: ticket.customerNotes,
      }),
    });
  }

  private async deliver(input: {
    tenantId: string;
    userId: string;
    kind: DocumentKind;
    entityId: string;
    documentNumber: string;
    recipient: string;
    subject: string;
    html: string;
    templateId?: string;
    templateVariables: Record<string, string>;
  }) {
    const recipient = input.recipient.trim().toLowerCase();
    const attemptId = crypto.randomUUID();
    try {
      const delivery = await this.resend.sendDocument({
        to: recipient,
        subject: input.subject,
        html: input.html,
        templateId: input.templateId,
        templateVariables: input.templateVariables,
        idempotencyKey: `document-${input.kind.toLowerCase()}-${input.entityId}-${attemptId}`,
      });
      const sentAt = new Date();
      await this.log(input, 'DOCUMENT_EMAIL_SENT', {
        status: 'SENT',
        recipient,
        sentAt: sentAt.toISOString(),
        provider: 'RESEND',
        providerMessageId: delivery.emailId,
        templateId: input.templateId ?? null,
      });
      return {
        status: 'SENT' as const,
        recipient,
        sentAt: sentAt.toISOString(),
        providerMessageId: delivery.emailId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar el documento.';
      await this.log(input, 'DOCUMENT_EMAIL_FAILED', {
        status: 'FAILED',
        recipient,
        failedAt: new Date().toISOString(),
        provider: 'RESEND',
        error: message.slice(0, 1000),
      });
      throw new BadRequestException(message);
    }
  }

  private log(
    input: {
      tenantId: string;
      userId: string;
      kind: DocumentKind;
      entityId: string;
      documentNumber: string;
    },
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action,
        entity: this.entity(input.kind),
        entityId: input.entityId,
        metadata: {
          kind: input.kind,
          documentNumber: input.documentNumber,
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private entity(kind: DocumentKind) {
    if (kind === 'QUOTATION') return 'SalesOrder';
    if (kind === 'WORKSHOP_QUOTE') return 'WorkshopTicket';
    return 'Invoice';
  }

  private variables(values: Record<string, string>) {
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? '']));
  }

  private renderHtml(input: {
    workshop: {
      commercialName: string | null;
      name: string;
      rnc: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
    };
    customerName: string;
    documentLabel: string;
    documentNumber: string;
    fiscalNumber?: string;
    vehicle?: string;
    items: Array<{
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      total: Prisma.Decimal;
    }>;
    subtotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    total: Prisma.Decimal;
    note?: string | null;
  }) {
    const e = this.escape;
    const money = (value: Prisma.Decimal) =>
      `RD$ ${Number(value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const rows = input.items
      .map(
        (item) =>
          `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">${e(item.description)}</td><td style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">${e(item.quantity.toString())}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb">${money(item.unitPrice)}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;font-weight:600">${money(item.total)}</td></tr>`,
      )
      .join('');
    const workshopName = input.workshop.commercialName ?? input.workshop.name;
    return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:720px;margin:0 auto;padding:28px 14px"><div style="background:#fff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden"><div style="padding:24px;background:#18181b;color:#fff"><h1 style="margin:0;font-size:24px">${e(workshopName)}</h1><p style="margin:8px 0 0;color:#d4d4d8">${e(input.documentLabel)} ${e(input.documentNumber)}</p></div><div style="padding:24px"><p>Hola <strong>${e(input.customerName)}</strong>,</p><p>Adjuntamos el detalle de tu ${e(input.documentLabel.toLowerCase())}.</p>${input.vehicle ? `<p style="padding:12px;background:#f4f4f5;border-radius:8px"><strong>Vehículo:</strong> ${e(input.vehicle)}</p>` : ''}${input.fiscalNumber ? `<p><strong>Comprobante fiscal:</strong> ${e(input.fiscalNumber)}</p>` : ''}<table style="width:100%;border-collapse:collapse;margin-top:20px"><thead><tr style="background:#f4f4f5"><th style="padding:10px;text-align:left">Descripción</th><th>Cant.</th><th style="text-align:right">Precio</th><th style="padding:10px;text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><div style="margin:20px 0 0 auto;max-width:310px"><p style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${money(input.subtotal)}</strong></p><p style="display:flex;justify-content:space-between"><span>Impuestos</span><strong>${money(input.taxTotal)}</strong></p>${input.discountTotal.gt(0) ? `<p style="display:flex;justify-content:space-between"><span>Descuento</span><strong>-${money(input.discountTotal)}</strong></p>` : ''}<p style="display:flex;justify-content:space-between;font-size:20px;border-top:2px solid #18181b;padding-top:12px"><span>Total</span><strong>${money(input.total)}</strong></p></div>${input.note ? `<p style="margin-top:20px;padding:12px;background:#fafafa">${e(input.note)}</p>` : ''}</div><div style="padding:18px 24px;background:#fafafa;color:#52525b;font-size:13px">${[input.workshop.rnc ? `RNC ${e(input.workshop.rnc)}` : '', input.workshop.phone ? e(input.workshop.phone) : '', input.workshop.email ? e(input.workshop.email) : '', input.workshop.address ? e(input.workshop.address) : ''].filter(Boolean).join(' · ')}</div></div></div></body></html>`;
  }

  private escape(value: string) {
    return value.replace(
      /[&<>'"]/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!,
    );
  }
}
