CREATE TABLE "WorkshopService" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "defaultPrice" DECIMAL(12,2) NOT NULL,
  "estimatedMinutes" INTEGER,
  "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopService_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkshopTicketLine" ADD COLUMN "serviceId" TEXT;

CREATE UNIQUE INDEX "WorkshopService_productId_key" ON "WorkshopService"("productId");
CREATE UNIQUE INDEX "WorkshopService_tenantId_code_key" ON "WorkshopService"("tenantId", "code");
CREATE INDEX "WorkshopService_tenantId_active_idx" ON "WorkshopService"("tenantId", "active");
CREATE INDEX "WorkshopService_tenantId_name_idx" ON "WorkshopService"("tenantId", "name");
CREATE INDEX "WorkshopTicketLine_serviceId_idx" ON "WorkshopTicketLine"("serviceId");

ALTER TABLE "WorkshopService"
  ADD CONSTRAINT "WorkshopService_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopService"
  ADD CONSTRAINT "WorkshopService_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicketLine"
  ADD CONSTRAINT "WorkshopTicketLine_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "WorkshopService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
