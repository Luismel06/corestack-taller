import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus, UserStatus } from '@qorvex/database';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { effectivePermissions, legacyPermissions } from '@qorvex/permissions';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email.toLowerCase(),
      },
      include: {
        memberships: {
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const activeMemberships = user.memberships.filter(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE && membership.tenant.status === 'ACTIVE',
    );

    const configuredExpiresIn = this.config.get<string>('JWT_EXPIRES_IN', '8h');
    if (!activeMemberships.length)
      throw new UnauthorizedException('No tienes acceso activo a una empresa.');
    const tokenOptions = {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.parseExpiresInSeconds(configuredExpiresIn),
    } as Parameters<JwtService['signAsync']>[1];

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
      },
      tokenOptions,
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: configuredExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      memberships: activeMemberships.map((membership) => ({
        id: membership.id,
        tenantId: membership.tenantId,
        tenantName: membership.tenant.name,
        tenantSlug: membership.tenant.slug,
        role: membership.role,
        permissions: {
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
          ...effectivePermissions(membership),
          ...legacyPermissions(effectivePermissions(membership)),
        },
      })),
    };
  }

  private parseExpiresInSeconds(value: string) {
    const match = value.match(/^(\d+)([smhd])$/);

    if (!match) {
      return 8 * 60 * 60;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    if (unit === 's') {
      return amount;
    }

    if (unit === 'm') {
      return amount * 60;
    }

    if (unit === 'h') {
      return amount * 60 * 60;
    }

    return amount * 24 * 60 * 60;
  }
}
