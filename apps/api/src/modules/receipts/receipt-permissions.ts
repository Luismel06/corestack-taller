import { requirePermissions } from '../../common/authorization';
import { AuthenticatedUser } from '../../common/types/authenticated-request';

export function requireReceiptPricingPermission(
  user: AuthenticatedUser,
  tenantId: string,
  items?: ReadonlyArray<{ priceDecision?: string | null; manualSalePrice?: unknown }>,
) {
  if (
    items?.some(
      (item) =>
        (item.priceDecision !== undefined &&
          item.priceDecision !== null &&
          item.priceDecision !== 'KEEP') ||
        (item.manualSalePrice !== undefined && item.manualSalePrice !== null),
    )
  )
    requirePermissions(user, tenantId, 'products.manage');
}
