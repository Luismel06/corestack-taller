-- Replace the legacy workshop cashier account with the accounting profile.
-- The email is deliberately preserved so existing credentials keep working.
WITH "targetUsers" AS (
  SELECT "id"
  FROM "User"
  WHERE "name" IN ('Cajero Taller', 'Cajero X')
)
UPDATE "User"
SET "name" = 'Contador Taller', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM "targetUsers");

WITH "targetUsers" AS (
  SELECT "id"
  FROM "User"
  WHERE "name" = 'Contador Taller'
)
UPDATE "Membership"
SET
  "role" = 'ACCOUNTANT',
  "canUsePos" = false,
  "canOpenCashSession" = false,
  "canCloseCashSession" = false,
  "canApplyDiscount" = false,
  "canCancelInvoice" = false,
  "canVoidInvoice" = false,
  "canAdjustInventory" = false,
  "canManageProducts" = false,
  "canManageEmployees" = false,
  "canViewReports" = true,
  "canManageFiscalSequences" = true,
  "canViewCashLogs" = true,
  "canReprintReceipt" = true,
  "canTakeOrders" = false,
  "permissionOverrides" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IN (SELECT "id" FROM "targetUsers")
  AND "role" = 'CASHIER';

UPDATE "EmployeeProfile"
SET "jobTitle" = 'Contador', "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IN (SELECT "id" FROM "User" WHERE "name" = 'Contador Taller')
  AND ("jobTitle" IS NULL OR "jobTitle" ILIKE '%cajer%');
