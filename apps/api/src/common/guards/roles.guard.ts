import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@qorvex/database';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { requirePermissions } from '../authorization';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required) {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      requirePermissions(request.user, request.tenantId, ...required);
      return true;
    }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const tenantId = request.tenantId;

    if (!user || !tenantId) {
      throw new ForbiddenException('Role checks require authenticated tenant context.');
    }

    const platformRole = user.memberships.find(
      (membership) =>
        membership.status === 'ACTIVE' &&
        (membership.role === Role.SUPER_ADMIN || membership.role === Role.QORVEX_SUPER_ADMIN),
    )?.role;
    const tenantRole = user.memberships.find(
      (membership) => membership.tenantId === tenantId && membership.status === 'ACTIVE',
    )?.role;
    const roleForTenant = platformRole ?? tenantRole;

    if (!roleForTenant || !roles.includes(roleForTenant)) {
      throw new ForbiddenException('Insufficient role for this operation.');
    }

    return true;
  }
}
