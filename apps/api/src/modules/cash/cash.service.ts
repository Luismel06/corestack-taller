import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  EmployeeLogAction,
  PaymentMethod,
  Prisma,
  Role,
  SalesOrderStatus,
} from '@qorvex/database';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { requirePermissions, userPermissions } from '../../common/authorization';
import { legacyPermissionMap } from '@qorvex/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  findRegisters(tenantId: string) {
    return this.prisma.cashRegister.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRegister(tenantId: string, user: AuthenticatedUser, dto: CreateCashRegisterDto) {
    this.requireCashRegisterManagement(tenantId, user);

    const name = dto.name.trim();
    const location = dto.location?.trim() || null;
    const existing = await this.prisma.cashRegister.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Ya existe una caja con ese nombre.');
    }

    return this.prisma.cashRegister.create({
      data: {
        tenantId,
        name,
        location,
      },
    });
  }

  findSessions(tenantId: string, user: AuthenticatedUser) {
    const membership = user.memberships.find((candidate) => candidate.tenantId === tenantId);
    if (membership?.role === Role.CASHIER) {
      throw new ForbiddenException('El cajero gestiona su sesión únicamente desde Caja.');
    }
    this.requireCashLogAccess(tenantId, user);

    return this.prisma.cashSession.findMany({
      where: { tenantId },
      include: this.cashSessionReportInclude(),
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }

  findPaymentSessions(tenantId: string, user: AuthenticatedUser) {
    const permissions = userPermissions(user, tenantId);
    if (
      !['receivables.collect', 'receivables.cancel_payment', 'returns.approve'].some(
        (permission) => permissions[permission] === true,
      )
    ) {
      throw new ForbiddenException('No tienes permiso para esta operación.');
    }
    // Payment forms need an open register selector, not access to its balances or ledger.
    return this.prisma.cashSession.findMany({
      where: { tenantId, status: CashSessionStatus.OPEN },
      select: {
        id: true,
        status: true,
        cashRegister: { select: { id: true, name: true } },
        openedBy: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  findCurrentSession(tenantId: string, user: AuthenticatedUser) {
    return this.prisma.cashSession.findFirst({
      where: {
        tenantId,
        openedById: user.id,
        status: CashSessionStatus.OPEN,
      },
      include: this.cashSessionReportInclude(),
      orderBy: { openedAt: 'desc' },
    });
  }

  findMovements(tenantId: string, user: AuthenticatedUser) {
    this.requireCashLogAccess(tenantId, user);

    return this.prisma.cashMovement.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true } },
        cashSession: { include: { cashRegister: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  async openSession(tenantId: string, user: AuthenticatedUser, dto: OpenCashSessionDto) {
    this.requireOpenCashSessionPermission(tenantId, user);

    if (!Number.isFinite(dto.openingAmount) || dto.openingAmount < 0) {
      throw new BadRequestException('El monto inicial no puede ser negativo.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "CashRegister" WHERE "id" = ${dto.cashRegisterId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const register = await tx.cashRegister.findFirst({
        where: {
          id: dto.cashRegisterId,
          tenantId,
          status: 'ACTIVE',
        },
      });

      if (!register) {
        throw new NotFoundException('Cash register not found for tenant.');
      }

      const openSession = await tx.cashSession.findFirst({
        where: {
          tenantId,
          status: CashSessionStatus.OPEN,
          OR: [{ cashRegisterId: dto.cashRegisterId }, { openedById: user.id }],
        },
      });

      if (openSession) {
        throw new BadRequestException('This cash register already has an open session.');
      }

      const session = await tx.cashSession.create({
        data: {
          tenantId,
          cashRegisterId: dto.cashRegisterId,
          openedById: user.id,
          openingAmount: new Prisma.Decimal(dto.openingAmount),
        },
        include: {
          cashRegister: true,
          openedBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: session.id,
          userId: user.id,
          type: CashMovementType.OPENING,
          amount: new Prisma.Decimal(dto.openingAmount),
          method: PaymentMethod.CASH,
          reason: 'Apertura de caja',
          reference: session.id,
        },
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: user.id,
          cashSessionId: session.id,
          action: EmployeeLogAction.OPEN_CASH_SESSION,
          entity: 'CashSession',
          entityId: session.id,
          amount: new Prisma.Decimal(dto.openingAmount),
          metadata: { register: register.name },
        },
      });

      return session;
    });
  }

  async closeSession(
    tenantId: string,
    user: AuthenticatedUser,
    cashSessionId: string,
    dto: CloseCashSessionDto,
  ) {
    this.requirePermission(tenantId, user, 'canCloseCashSession');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CashSession" WHERE "id" = ${cashSessionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const session = await tx.cashSession.findFirst({
        where: {
          id: cashSessionId,
          tenantId,
          status: CashSessionStatus.OPEN,
        },
      });

      if (!session) {
        throw new NotFoundException('Open cash session not found for tenant.');
      }

      const claimedOrders = await tx.salesOrder.count({
        where: {
          tenantId,
          claimedCashSessionId: cashSessionId,
          status: SalesOrderStatus.IN_CASHIER,
        },
      });

      if (claimedOrders > 0) {
        throw new BadRequestException(
          'Close pending claimed sales orders before closing cash session.',
        );
      }

      const movements = await tx.cashMovement.findMany({
        where: {
          tenantId,
          cashSessionId,
        },
        select: {
          type: true,
          amount: true,
          method: true,
        },
      });
      const negativeMovementTypes: CashMovementType[] = [
        CashMovementType.CASH_OUT,
        CashMovementType.REFUND,
        CashMovementType.SUPPLIER_PAYMENT,
      ];
      const expectedAmount = movements
        .reduce((sum, movement) => {
          if (movement.type === CashMovementType.CLOSING) {
            return sum;
          }

          if (movement.method && movement.method !== PaymentMethod.CASH) {
            return sum;
          }

          if (negativeMovementTypes.includes(movement.type)) {
            return sum.sub(movement.amount);
          }

          return sum.add(movement.amount);
        }, new Prisma.Decimal(0))
        .toDecimalPlaces(2);
      const closingAmount = new Prisma.Decimal(dto.closingAmount);
      const difference = closingAmount.sub(expectedAmount).toDecimalPlaces(2);

      const closed = await tx.cashSession.update({
        where: { id: cashSessionId },
        data: {
          status: CashSessionStatus.CLOSED,
          closedById: user.id,
          closingAmount,
          expectedAmount,
          difference,
          closedAt: new Date(),
        },
      });

      await tx.cashMovement.create({
        data: {
          tenantId,
          cashSessionId,
          userId: user.id,
          type: CashMovementType.CLOSING,
          amount: closingAmount,
          method: PaymentMethod.CASH,
          reason: dto.notes ?? 'Cierre de caja',
          reference: cashSessionId,
        },
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: user.id,
          cashSessionId,
          action: EmployeeLogAction.CLOSE_CASH_SESSION,
          entity: 'CashSession',
          entityId: cashSessionId,
          amount: closingAmount,
          metadata: {
            expectedAmount: expectedAmount.toString(),
            difference: difference.toString(),
          },
        },
      });

      return tx.cashSession.findUniqueOrThrow({
        where: { id: closed.id },
        include: this.cashSessionReportInclude(),
      });
    });
  }

  async createMovement(tenantId: string, user: AuthenticatedUser, dto: CreateCashMovementDto) {
    const permission =
      dto.type === CashMovementType.CASH_OUT
        ? 'cash.withdraw'
        : dto.type === CashMovementType.CASH_IN
          ? 'cash.deposit'
          : 'cash.adjust';
    requirePermissions(user, tenantId, permission);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CashSession" WHERE "id" = ${dto.cashSessionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const session = await tx.cashSession.findFirst({
        where: {
          id: dto.cashSessionId,
          tenantId,
          status: CashSessionStatus.OPEN,
        },
      });

      if (!session) {
        throw new NotFoundException('Open cash session not found for tenant.');
      }

      const manualMovementTypes: CashMovementType[] = [
        CashMovementType.CASH_IN,
        CashMovementType.CASH_OUT,
        CashMovementType.ADJUSTMENT,
      ];

      if (!manualMovementTypes.includes(dto.type)) {
        throw new BadRequestException(
          'Manual cash movements must be cash in, cash out, or adjustment.',
        );
      }

      const movement = await tx.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: dto.cashSessionId,
          userId: user.id,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          method: dto.method ?? PaymentMethod.CASH,
          reason: dto.reason,
          reference: dto.reference,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: user.id,
          cashSessionId: dto.cashSessionId,
          action:
            dto.type === CashMovementType.CASH_OUT
              ? EmployeeLogAction.CASH_OUT
              : EmployeeLogAction.CASH_IN,
          entity: 'CashMovement',
          entityId: movement.id,
          amount: movement.amount,
          metadata: {
            type: dto.type,
            reason: dto.reason,
            reference: dto.reference,
          },
        },
      });

      return movement;
    });
  }

  private requirePermission(
    tenantId: string,
    user: AuthenticatedUser,
    permission: 'canOpenCashSession' | 'canCloseCashSession' | 'canViewCashLogs',
  ) {
    requirePermissions(user, tenantId, legacyPermissionMap[permission]);
  }

  private requireOpenCashSessionPermission(tenantId: string, user: AuthenticatedUser) {
    requirePermissions(user, tenantId, 'cash.open');
    const membership = user.memberships.find((candidate) => candidate.tenantId === tenantId);
    const adminRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN];
    if (!membership || adminRoles.includes(membership.role)) {
      throw new ForbiddenException('Admins cannot open cash sessions.');
    }
  }

  private requireCashRegisterManagement(tenantId: string, user: AuthenticatedUser) {
    const membership = user.memberships.find((candidate) => candidate.tenantId === tenantId);
    const adminRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN];
    if (!membership || !adminRoles.includes(membership.role)) {
      throw new ForbiddenException('Solo administradores pueden crear cajas.');
    }
  }

  private requireCashLogAccess(tenantId: string, user: AuthenticatedUser) {
    requirePermissions(user, tenantId, 'cash.view');
  }

  private cashSessionReportInclude() {
    return {
      cashRegister: true,
      openedBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      movements: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      invoices: {
        include: {
          customer: true,
          issuedBy: { select: { id: true, name: true, email: true } },
          items: true,
          payments: {
            select: {
              id: true,
              method: true,
              amount: true,
              status: true,
              paidAt: true,
              createdAt: true,
            },
          },
          salesOrder: { select: { id: true, orderNumber: true, status: true } },
        },
        orderBy: { issuedAt: 'asc' as const },
      },
      claimedSalesOrders: {
        include: {
          customer: true,
          createdBy: { select: { id: true, name: true, email: true } },
          completedBy: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
          items: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }
}
