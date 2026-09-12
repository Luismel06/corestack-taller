ALTER TABLE "SalesOrderItem"
ADD COLUMN "workshopTicketLineId" TEXT;

CREATE INDEX "SalesOrderItem_workshopTicketLineId_idx"
ON "SalesOrderItem"("workshopTicketLineId");

ALTER TABLE "SalesOrderItem"
ADD CONSTRAINT "SalesOrderItem_workshopTicketLineId_fkey"
FOREIGN KEY ("workshopTicketLineId") REFERENCES "WorkshopTicketLine"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
