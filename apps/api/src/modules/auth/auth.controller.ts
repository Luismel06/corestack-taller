import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { userPermissions } from '../../common/authorization';
import { legacyPermissions } from '@qorvex/permissions';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard, TenantMembershipGuard)
  currentAccess(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    const membership =
      user.memberships.find((item) => item.tenantId === tenantId) ??
      user.memberships.find((item) => ['SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'].includes(item.role));
    const permissions = userPermissions(user, tenantId);
    return {
      user: { id: user.id, name: user.name, email: user.email },
      role: membership?.role ?? 'SUPER_ADMIN',
      permissions: { ...permissions, ...legacyPermissions(permissions) },
    };
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('strategy')
  strategy() {
    return {
      currentPhase: 'jwt-email-password-and-membership-guards',
      tenantContext: 'x-tenant-id validated against authenticated memberships',
      implemented: [
        'Email/password login with bcrypt hash verification.',
        'JWT access token for API requests.',
        'Tenant membership validation before tenant-scoped API access.',
        'Role guard support per controller action.',
      ],
      nextPhase: ['Refresh token rotation.', 'Password recovery.', 'MFA-ready login events.'],
    };
  }
}
