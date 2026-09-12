CREATE TABLE "WorkshopDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "mileageOut" INTEGER NOT NULL,
  "recommendations" TEXT,
  "notes" TEXT,
  "deliveredById" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopDelivery_ticketId_key" ON "WorkshopDelivery"("ticketId");
CREATE INDEX "WorkshopDelivery_tenantId_deliveredAt_idx" ON "WorkshopDelivery"("tenantId", "deliveredAt");
CREATE INDEX "WorkshopDelivery_deliveredById_idx" ON "WorkshopDelivery"("deliveredById");

ALTER TABLE "WorkshopDelivery"
  ADD CONSTRAINT "WorkshopDelivery_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopDelivery"
  ADD CONSTRAINT "WorkshopDelivery_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopDelivery"
  ADD CONSTRAINT "WorkshopDelivery_deliveredById_fkey"
  FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
