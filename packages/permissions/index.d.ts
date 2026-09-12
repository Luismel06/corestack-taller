export const permissionLabels: Record<string, string>;
export const maxTenantUsers: number;
export const permissions: string[];
export const roleLabels: Record<string, string>;
export const rolePermissions: Record<string, string[]>;
export const legacyPermissionMap: Record<string, string>;
export function effectivePermissions(membership: {
  role: string;
  permissionOverrides?: unknown;
  [key: string]: unknown;
}): Record<string, boolean>;
export function legacyPermissions(effective: Record<string, boolean>): Record<string, boolean>;
