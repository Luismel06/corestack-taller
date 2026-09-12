CREATE TABLE "WorkshopQuoteVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "WorkshopApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "laborTotal" DECIMAL(12,2) NOT NULL,
  "partsTotal" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkshopQuoteVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopQuoteVersion_ticketId_version_key" ON "WorkshopQuoteVersion"("ticketId", "version");
CREATE INDEX "WorkshopQuoteVersion_tenantId_status_createdAt_idx" ON "WorkshopQuoteVersion"("tenantId", "status", "createdAt");
CREATE INDEX "WorkshopQuoteVersion_createdById_idx" ON "WorkshopQuoteVersion"("createdById");

ALTER TABLE "WorkshopQuoteVersion"
  ADD CONSTRAINT "WorkshopQuoteVersion_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopQuoteVersion"
  ADD CONSTRAINT "WorkshopQuoteVersion_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopQuoteVersion"
  ADD CONSTRAINT "WorkshopQuoteVersion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
