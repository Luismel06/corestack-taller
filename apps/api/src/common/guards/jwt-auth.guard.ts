import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus, UserStatus } from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { effectivePermissions, legacyPermissions } from '@qorvex/permissions';

type JwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      include: {
        memberships: { include: { tenant: { select: { status: true } } } },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not active.');
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      memberships: user.memberships
        .filter(
          (membership) =>
            membership.status === MembershipStatus.ACTIVE && membership.tenant.status === 'ACTIVE',
        )
        .map((membership) => ({
          id: membership.id,
          tenantId: membership.tenantId,
          role: membership.role,
          status: membership.status,
          canUsePos: membership.canUsePos,
          canOpenCashSession: membership.canOpenCashSession,
          canCloseCashSession: membership.canCloseCashSession,
          canApplyDiscount: membership.canApplyDiscount,
          canCancelInvoice: membership.canCancelInvoice,
          canVoidInvoice: membership.canVoidInvoice,
          canAdjustInventory: membership.canAdjustInventory,
          canManageProducts: membership.canManageProducts,
          canManageEmployees: membership.canManageEmployees,
          canViewReports: membership.canViewReports,
          canManageFiscalSequences: membership.canManageFiscalSequences,
          canViewCashLogs: membership.canViewCashLogs,
          canReprintReceipt: membership.canReprintReceipt,
          canTakeOrders: membership.canTakeOrders,
          permissionOverrides: membership.permissionOverrides,
          ...legacyPermissions(effectivePermissions(membership)),
        })),
    };

    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest) {
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!header?.startsWith('Bearer ')) {
      return null;
    }

    return header.slice('Bearer '.length);
  }
}
