-- ALLPA used a separate B2B warehouse. A workshop has one operational stock.
-- Consolidate any historical warehouse quantities without deleting their audit records.
UPDATE "Product" AS product
SET "stock" = product."stock" + stock_totals."quantity",
    "inventoryDestination" = 'SALES_INVENTORY'
FROM (
  SELECT "tenantId", "productId", SUM("quantity") AS "quantity"
  FROM "WarehouseStock"
  GROUP BY "tenantId", "productId"
) AS stock_totals
WHERE product."tenantId" = stock_totals."tenantId"
  AND product."id" = stock_totals."productId";

UPDATE "Product"
SET "inventoryDestination" = 'SALES_INVENTORY'
WHERE "inventoryDestination" = 'WAREHOUSE';

UPDATE "PurchaseOrder"
SET "destination" = 'SALES_INVENTORY'
WHERE "destination" = 'WAREHOUSE';

UPDATE "SalesOrder"
SET "inventorySource" = 'SALES_INVENTORY'
WHERE "inventorySource" = 'WAREHOUSE';
