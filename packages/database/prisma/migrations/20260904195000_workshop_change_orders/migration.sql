CREATE TYPE "WorkshopChangeOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "WorkshopChangeOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "WorkshopChangeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "laborTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "partsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "responseNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkshopChangeOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkshopChangeOrderLine" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "type" "WorkshopTicketLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkshopChangeOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopChangeOrder_ticketId_number_key" ON "WorkshopChangeOrder"("ticketId", "number");
CREATE INDEX "WorkshopChangeOrder_tenantId_status_createdAt_idx" ON "WorkshopChangeOrder"("tenantId", "status", "createdAt");
CREATE INDEX "WorkshopChangeOrder_createdById_idx" ON "WorkshopChangeOrder"("createdById");
CREATE INDEX "WorkshopChangeOrder_respondedById_idx" ON "WorkshopChangeOrder"("respondedById");
CREATE INDEX "WorkshopChangeOrderLine_changeOrderId_idx" ON "WorkshopChangeOrderLine"("changeOrderId");
CREATE INDEX "WorkshopChangeOrderLine_productId_idx" ON "WorkshopChangeOrderLine"("productId");
CREATE INDEX "WorkshopChangeOrderLine_serviceId_idx" ON "WorkshopChangeOrderLine"("serviceId");

ALTER TABLE "WorkshopChangeOrder" ADD CONSTRAINT "WorkshopChangeOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopChangeOrder" ADD CONSTRAINT "WorkshopChangeOrder_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopChangeOrder" ADD CONSTRAINT "WorkshopChangeOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopChangeOrder" ADD CONSTRAINT "WorkshopChangeOrder_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopChangeOrderLine" ADD CONSTRAINT "WorkshopChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "WorkshopChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopChangeOrderLine" ADD CONSTRAINT "WorkshopChangeOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopChangeOrderLine" ADD CONSTRAINT "WorkshopChangeOrderLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "WorkshopService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
