import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { FiscalSequenceStatus, InvoiceDocumentType, Role } from '@qorvex/database';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { requirePermissions } from '../../common/authorization';
import {
  normalizeDominicanDocument,
  validateDominicanDocument,
} from '../../common/utils/dominican-documents';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFiscalSequenceDto } from './dto/create-fiscal-sequence.dto';

const fiscalDocumentConfig: Record<InvoiceDocumentType, { prefix: string; digits: number }> = {
  [InvoiceDocumentType.FISCAL_CREDIT_01]: { prefix: 'B01', digits: 8 },
  [InvoiceDocumentType.CONSUMER_02]: { prefix: 'B02', digits: 8 },
  [InvoiceDocumentType.FISCAL_CREDIT_ELECTRONIC_31]: { prefix: 'E31', digits: 10 },
  [InvoiceDocumentType.CONSUMER_ELECTRONIC_32]: { prefix: 'E32', digits: 10 },
  [InvoiceDocumentType.DEBIT_NOTE_ELECTRONIC_33]: { prefix: 'E33', digits: 10 },
  [InvoiceDocumentType.CREDIT_NOTE_ELECTRONIC_34]: { prefix: 'E34', digits: 10 },
};

type FiscalSequenceAlert = {
  id: string;
  documentType: InvoiceDocumentType;
  prefix: string;
  nextNumber: number;
  endNumber: number;
  remaining: number;
  threshold: number;
  validUntil: Date | null;
  status: FiscalSequenceStatus;
  severity: 'warning' | 'critical';
  expired: boolean;
  exhausted: boolean;
  missing?: boolean;
};

@Injectable()
export class FiscalSequencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const [sequences, tenant] = await Promise.all([
      this.prisma.fiscalSequence.findMany({
        where: { tenantId },
        orderBy: [{ documentType: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { rnc: true },
      }),
    ]);

    return sequences.map((sequence) => ({
      ...sequence,
      issuerDocumentType: sequence.issuerDocumentType ?? (tenant?.rnc ? 'RNC' : null),
      issuerDocumentNumber: sequence.issuerDocumentNumber ?? tenant?.rnc ?? null,
    }));
  }

  async getAlerts(tenantId: string) {
    const now = new Date();
    const sequences = await this.prisma.fiscalSequence.findMany({
      where: {
        tenantId,
        documentType: {
          in: [
            InvoiceDocumentType.FISCAL_CREDIT_01,
            InvoiceDocumentType.CONSUMER_02,
            InvoiceDocumentType.FISCAL_CREDIT_ELECTRONIC_31,
            InvoiceDocumentType.CONSUMER_ELECTRONIC_32,
          ],
        },
      },
      orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
    });

    const alertableStatuses: FiscalSequenceStatus[] = [
      FiscalSequenceStatus.ACTIVE,
      FiscalSequenceStatus.EXHAUSTED,
      FiscalSequenceStatus.EXPIRED,
    ];
    const alertableSequences = sequences.filter((sequence) =>
      alertableStatuses.includes(sequence.status),
    );
    const alerts: FiscalSequenceAlert[] = alertableSequences
      .filter(
        (sequence, index, allSequences) =>
          sequence.status === FiscalSequenceStatus.ACTIVE ||
          (!allSequences.some(
            (candidate) =>
              candidate.documentType === sequence.documentType &&
              candidate.status === FiscalSequenceStatus.ACTIVE,
          ) &&
            allSequences.findIndex(
              (candidate) => candidate.documentType === sequence.documentType,
            ) === index),
      )
      .map((sequence) => {
        const total = sequence.endNumber - sequence.startNumber + 1;
        const remaining = Math.max(sequence.endNumber - sequence.nextNumber + 1, 0);
        const threshold = Math.max(25, Math.ceil(total * 0.1));
        const expired =
          sequence.status === FiscalSequenceStatus.EXPIRED ||
          (sequence.validUntil !== null && sequence.validUntil < now);
        const exhausted = sequence.status === FiscalSequenceStatus.EXHAUSTED || remaining === 0;

        return {
          id: sequence.id,
          documentType: sequence.documentType,
          prefix: sequence.prefix,
          nextNumber: sequence.nextNumber,
          endNumber: sequence.endNumber,
          remaining,
          threshold,
          validUntil: sequence.validUntil,
          status: sequence.status,
          severity:
            expired || exhausted || remaining <= Math.max(5, Math.ceil(total * 0.02))
              ? ('critical' as const)
              : ('warning' as const),
          expired,
          exhausted,
        };
      })
      .filter(
        (sequence) =>
          sequence.expired || sequence.exhausted || sequence.remaining <= sequence.threshold,
      );

    if (!sequences.some((sequence) => sequence.documentType === InvoiceDocumentType.CONSUMER_02)) {
      alerts.unshift({
        id: 'missing-consumer-02-sequence',
        documentType: InvoiceDocumentType.CONSUMER_02,
        prefix: 'B02',
        nextNumber: 0,
        endNumber: 0,
        remaining: 0,
        threshold: 0,
        validUntil: null,
        status: FiscalSequenceStatus.EXHAUSTED,
        severity: 'critical',
        expired: false,
        exhausted: false,
        missing: true,
      });
    }

    return alerts;
  }

  async create(tenantId: string, user: AuthenticatedUser, dto: CreateFiscalSequenceDto) {
    this.assertCanManageSequences(tenantId, user);

    if (dto.endNumber < dto.startNumber) {
      throw new BadRequestException('El número final no puede ser menor que el número inicial.');
    }

    if (dto.nextNumber < dto.startNumber || dto.nextNumber > dto.endNumber) {
      throw new BadRequestException('El siguiente número debe estar dentro del rango autorizado.');
    }

    const config = fiscalDocumentConfig[dto.documentType];
    if (!config) {
      throw new BadRequestException('Este tipo de comprobante no admite bloques fiscales.');
    }

    if (dto.issuerDocumentType !== 'RNC' && dto.issuerDocumentType !== 'CEDULA') {
      throw new BadRequestException('El documento del emisor debe ser RNC o cédula.');
    }

    if (!validateDominicanDocument(dto.issuerDocumentType, dto.issuerDocumentNumber)) {
      throw new BadRequestException(
        dto.issuerDocumentType === 'RNC'
          ? 'El RNC del emisor no es válido.'
          : 'La cédula del emisor no es válida.',
      );
    }

    const issuerDocumentNumber = normalizeDominicanDocument(dto.issuerDocumentNumber);

    const validUntil = dto.validUntil ? this.parseValidUntil(dto.validUntil) : null;
    const requiresDgiiAuthorization =
      dto.documentType === InvoiceDocumentType.FISCAL_CREDIT_01 ||
      dto.documentType === InvoiceDocumentType.FISCAL_CREDIT_ELECTRONIC_31;
    if (requiresDgiiAuthorization && !validUntil) {
      throw new BadRequestException(
        `${config.prefix} requiere registrar la fecha de vencimiento autorizada por DGII.`,
      );
    }

    if (requiresDgiiAuthorization && !dto.authorizationNumber?.trim()) {
      throw new BadRequestException(`${config.prefix} requiere el número de autorización de DGII.`);
    }

    if (validUntil && validUntil.getTime() < Date.now()) {
      throw new BadRequestException('La vigencia del bloque no puede estar vencida.');
    }

    return this.prisma.$transaction(async (tx) => {
      const overlap = await tx.fiscalSequence.findFirst({
        where: {
          tenantId,
          documentType: dto.documentType,
          startNumber: { lte: dto.endNumber },
          endNumber: { gte: dto.startNumber },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new BadRequestException('El rango autorizado se solapa con un bloque ya registrado.');
      }

      const activeBlock = await tx.fiscalSequence.findFirst({
        where: {
          tenantId,
          documentType: dto.documentType,
          status: FiscalSequenceStatus.ACTIVE,
        },
        select: { id: true },
      });

      return tx.fiscalSequence.create({
        data: {
          tenantId,
          documentType: dto.documentType,
          prefix: config.prefix,
          startNumber: dto.startNumber,
          endNumber: dto.endNumber,
          nextNumber: dto.nextNumber,
          authorizationNumber: dto.authorizationNumber?.trim() || null,
          issuerDocumentType: dto.issuerDocumentType,
          issuerDocumentNumber,
          validUntil,
          status: activeBlock ? FiscalSequenceStatus.INACTIVE : FiscalSequenceStatus.ACTIVE,
        },
      });
    });
  }

  private parseValidUntil(value: string) {
    const parsed = new Date(`${value}T23:59:59.999Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('La fecha de vigencia no es válida.');
    }

    return parsed;
  }

  private assertCanManageSequences(tenantId: string, user: AuthenticatedUser) {
    requirePermissions(user, tenantId, 'settings.fiscal');
    const tenantMembership = user.memberships.find(
      (membership) => membership.tenantId === tenantId,
    );
    const platformMembership = user.memberships.find(
      (membership) =>
        membership.role === Role.SUPER_ADMIN || membership.role === Role.QORVEX_SUPER_ADMIN,
    );

    if (!tenantMembership || (!tenantMembership.canManageFiscalSequences && !platformMembership)) {
      throw new ForbiddenException('Se requiere permiso para administrar secuencias fiscales.');
    }
  }
}
