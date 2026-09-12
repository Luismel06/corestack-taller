import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@qorvex/database';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const headerValue = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!tenantId) {
      throw new ForbiddenException('Missing x-tenant-id header.');
    }

    const user = request.user;

    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Authenticated user is required.');
    }

    const hasTenantAccess = user.memberships.some(
      (membership) =>
        membership.status === 'ACTIVE' &&
        (membership.tenantId === tenantId ||
          membership.role === Role.SUPER_ADMIN ||
          membership.role === Role.QORVEX_SUPER_ADMIN),
    );

    if (!hasTenantAccess) {
      throw new ForbiddenException('User does not belong to this tenant.');
    }

    request.tenantId = tenantId;
    return true;
  }
}
