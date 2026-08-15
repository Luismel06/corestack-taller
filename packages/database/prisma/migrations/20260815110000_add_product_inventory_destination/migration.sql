-- Keep warehouse products out of the sales catalog and POS inventory.
CREATE TYPE "ProductInventoryDestination" AS ENUM ('SALES_INVENTORY', 'WAREHOUSE');

ALTER TABLE "Product"
ADD COLUMN "inventoryDestination" "ProductInventoryDestination" NOT NULL DEFAULT 'SALES_INVENTORY';

CREATE INDEX "Product_tenantId_inventoryDestination_status_idx"
ON "Product"("tenantId", "inventoryDestination", "status");
