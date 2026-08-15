ALTER TYPE "WarehouseMovementType" ADD VALUE 'SALE';

ALTER TABLE "SalesOrder"
ADD COLUMN "inventorySource" "ProductInventoryDestination" NOT NULL DEFAULT 'SALES_INVENTORY';

CREATE INDEX "SalesOrder_tenantId_inventorySource_status_idx"
ON "SalesOrder"("tenantId", "inventorySource", "status");
