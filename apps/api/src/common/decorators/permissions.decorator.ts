import { SetMetadata } from '@nestjs/common';
import { permissions } from '@qorvex/permissions';
export const PERMISSIONS_KEY = 'requiredPermissions';
export function RequirePermissions(...required: string[]) {
  if (required.some((permission) => !permissions.includes(permission)))
    throw new Error('Unknown permission in route policy.');
  return SetMetadata(PERMISSIONS_KEY, required);
}
