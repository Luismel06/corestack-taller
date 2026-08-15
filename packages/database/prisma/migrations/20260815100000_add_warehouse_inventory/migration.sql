CREATE TYPE "PurchaseOrderDestination" AS ENUM ('SALES_INVENTORY', 'WAREHOUSE');

CREATE TYPE "WarehouseMovementType" AS ENUM ('PURCHASE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "destination" "PurchaseOrderDestination" NOT NULL DEFAULT 'SALES_INVENTORY';

CREATE TABLE "WarehouseStock" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarehouseStock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "type" "WarehouseMovementType" NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "previousQuantity" DOUBLE PRECISION,
  "newQuantity" DOUBLE PRECISION,
  "unitCost" DECIMAL(12,2),
  "reason" TEXT,
  "reference" TEXT,
  "supplierInvoiceId" TEXT,
  "goodsReceiptId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarehouseMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarehouseStock_tenantId_productId_key" ON "WarehouseStock"("tenantId", "productId");
CREATE INDEX "WarehouseStock_tenantId_idx" ON "WarehouseStock"("tenantId");
CREATE INDEX "WarehouseStock_productId_idx" ON "WarehouseStock"("productId");
CREATE INDEX "WarehouseStock_tenantId_quantity_idx" ON "WarehouseStock"("tenantId", "quantity");
CREATE INDEX "WarehouseMovement_tenantId_idx" ON "WarehouseMovement"("tenantId");
CREATE INDEX "WarehouseMovement_tenantId_type_idx" ON "WarehouseMovement"("tenantId", "type");
CREATE INDEX "WarehouseMovement_tenantId_createdAt_idx" ON "WarehouseMovement"("tenantId", "createdAt");
CREATE INDEX "WarehouseMovement_productId_idx" ON "WarehouseMovement"("productId");
CREATE INDEX "WarehouseMovement_goodsReceiptId_idx" ON "WarehouseMovement"("goodsReceiptId");
CREATE INDEX "WarehouseMovement_createdById_idx" ON "WarehouseMovement"("createdById");

ALTER TABLE "WarehouseStock"
  ADD CONSTRAINT "WarehouseStock_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WarehouseStock_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WarehouseMovement"
  ADD CONSTRAINT "WarehouseMovement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WarehouseMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WarehouseMovement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
