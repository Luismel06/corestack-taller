ALTER TYPE "InventoryMovementType" ADD VALUE 'WORK_ORDER_RESERVATION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'WORK_ORDER_CONSUMPTION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'WORK_ORDER_RETURN';
ALTER TYPE "InventoryMovementType" ADD VALUE 'WORK_ORDER_RELEASE';

ALTER TABLE "WorkshopTicketLine" ADD COLUMN "consumedQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "WorkshopTicketLine" ADD COLUMN "releasedQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrderItem" ADD COLUMN "inventoryConsumedQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryMovement" ADD COLUMN "workshopTicketLineId" TEXT,
  ADD COLUMN "operationKey" TEXT;

ALTER TABLE "WorkshopTicketLine" ADD CONSTRAINT "WorkshopTicketLine_consumedQuantity_check"
  CHECK ("consumedQuantity" >= 0 AND "releasedQuantity" >= 0 AND "consumedQuantity" + "releasedQuantity" <= "quantity");
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_inventoryConsumedQuantity_check"
  CHECK ("inventoryConsumedQuantity" >= 0 AND "inventoryConsumedQuantity" <= "quantity");
CREATE UNIQUE INDEX "InventoryMovement_tenantId_operationKey_key" ON "InventoryMovement"("tenantId", "operationKey");
CREATE INDEX "InventoryMovement_workshopTicketLineId_idx" ON "InventoryMovement"("workshopTicketLineId");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_workshopTicketLineId_fkey"
  FOREIGN KEY ("workshopTicketLineId") REFERENCES "WorkshopTicketLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
