import { ForbiddenException } from '@nestjs/common';
import { effectivePermissions } from '@qorvex/permissions';
import { AuthenticatedUser } from './types/authenticated-request';

export function userPermissions(user: AuthenticatedUser | undefined, tenantId: string | undefined) {
  if (!user || !tenantId || user.status !== 'ACTIVE') return {} as Record<string, boolean>;
  const membership =
    user.memberships.find((item) => item.tenantId === tenantId && item.status === 'ACTIVE') ??
    user.memberships.find(
      (item) =>
        ['SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'].includes(item.role) && item.status === 'ACTIVE',
    );
  return membership ? effectivePermissions(membership) : {};
}
export function requirePermissions(
  user: AuthenticatedUser | undefined,
  tenantId: string | undefined,
  ...required: string[]
) {
  const granted = userPermissions(user, tenantId);
  if (required.some((permission) => granted[permission] !== true))
    throw new ForbiddenException('No tienes permiso para esta operación.');
}
