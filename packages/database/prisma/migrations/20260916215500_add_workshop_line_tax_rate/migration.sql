ALTER TABLE "WorkshopTicketLine"
ADD COLUMN "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.18;

ALTER TABLE "WorkshopChangeOrderLine"
ADD COLUMN "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.18;

UPDATE "WorkshopTicketLine" AS line
SET "taxRate" = product."taxRate"
FROM "Product" AS product
WHERE line."productId" = product."id";

UPDATE "WorkshopChangeOrderLine" AS line
SET "taxRate" = product."taxRate"
FROM "Product" AS product
WHERE line."productId" = product."id";
