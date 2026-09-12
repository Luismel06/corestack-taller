import type { MembershipStatus, Role, UserStatus } from '@qorvex/database';

export type AuthenticatedMembership = {
  id: string;
  tenantId: string;
  role: Role;
  status: MembershipStatus;
  permissionOverrides?: unknown;
  canUsePos: boolean;
  canOpenCashSession: boolean;
  canCloseCashSession: boolean;
  canApplyDiscount: boolean;
  canCancelInvoice: boolean;
  canVoidInvoice: boolean;
  canAdjustInventory: boolean;
  canManageProducts: boolean;
  canManageEmployees: boolean;
  canViewReports: boolean;
  canManageFiscalSequences: boolean;
  canViewCashLogs: boolean;
  canReprintReceipt: boolean;
  canTakeOrders: boolean;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  memberships: AuthenticatedMembership[];
};

export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  tenantId?: string;
};
