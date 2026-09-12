CREATE TYPE "WorkshopBayStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE');

CREATE TABLE "WorkshopBay" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "WorkshopBayStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopBay_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkshopReception" ADD COLUMN "bayId" TEXT;

CREATE UNIQUE INDEX "WorkshopBay_tenantId_code_key" ON "WorkshopBay"("tenantId", "code");
CREATE INDEX "WorkshopBay_tenantId_status_idx" ON "WorkshopBay"("tenantId", "status");
CREATE INDEX "WorkshopReception_bayId_idx" ON "WorkshopReception"("bayId");

ALTER TABLE "WorkshopBay"
  ADD CONSTRAINT "WorkshopBay_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopReception"
  ADD CONSTRAINT "WorkshopReception_bayId_fkey"
  FOREIGN KEY ("bayId") REFERENCES "WorkshopBay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
