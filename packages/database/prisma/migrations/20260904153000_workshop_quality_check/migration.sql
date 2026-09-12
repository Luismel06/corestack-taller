CREATE TYPE "WorkshopQualityStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "WorkshopQualityCheck" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "status" "WorkshopQualityStatus" NOT NULL DEFAULT 'PENDING',
  "workCompleted" BOOLEAN NOT NULL DEFAULT false,
  "partsVerified" BOOLEAN NOT NULL DEFAULT false,
  "leaksChecked" BOOLEAN NOT NULL DEFAULT false,
  "fluidsChecked" BOOLEAN NOT NULL DEFAULT false,
  "warningLightsChecked" BOOLEAN NOT NULL DEFAULT false,
  "roadTested" BOOLEAN NOT NULL DEFAULT false,
  "toolsRemoved" BOOLEAN NOT NULL DEFAULT false,
  "vehicleCleaned" BOOLEAN NOT NULL DEFAULT false,
  "observations" TEXT,
  "checkedById" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopQualityCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopQualityCheck_ticketId_key" ON "WorkshopQualityCheck"("ticketId");
CREATE INDEX "WorkshopQualityCheck_tenantId_status_idx" ON "WorkshopQualityCheck"("tenantId", "status");
CREATE INDEX "WorkshopQualityCheck_checkedById_idx" ON "WorkshopQualityCheck"("checkedById");

ALTER TABLE "WorkshopQualityCheck"
  ADD CONSTRAINT "WorkshopQualityCheck_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopQualityCheck"
  ADD CONSTRAINT "WorkshopQualityCheck_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopQualityCheck"
  ADD CONSTRAINT "WorkshopQualityCheck_checkedById_fkey"
  FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
