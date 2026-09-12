CREATE TYPE "WorkshopInspectionResult" AS ENUM ('GOOD', 'ATTENTION', 'REQUIRES_REPAIR', 'NOT_INSPECTED');

CREATE TABLE "WorkshopInspection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopInspection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkshopInspectionItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "result" "WorkshopInspectionResult" NOT NULL DEFAULT 'NOT_INSPECTED',
  "comment" TEXT,
  "recommendation" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopInspectionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopInspection_ticketId_key" ON "WorkshopInspection"("ticketId");
CREATE INDEX "WorkshopInspection_tenantId_inspectedAt_idx" ON "WorkshopInspection"("tenantId", "inspectedAt");
CREATE INDEX "WorkshopInspection_createdById_idx" ON "WorkshopInspection"("createdById");
CREATE UNIQUE INDEX "WorkshopInspectionItem_inspectionId_code_key" ON "WorkshopInspectionItem"("inspectionId", "code");
CREATE INDEX "WorkshopInspectionItem_tenantId_result_idx" ON "WorkshopInspectionItem"("tenantId", "result");
CREATE INDEX "WorkshopInspectionItem_inspectionId_sortOrder_idx" ON "WorkshopInspectionItem"("inspectionId", "sortOrder");

ALTER TABLE "WorkshopInspection"
  ADD CONSTRAINT "WorkshopInspection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopInspection"
  ADD CONSTRAINT "WorkshopInspection_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopInspection"
  ADD CONSTRAINT "WorkshopInspection_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopInspectionItem"
  ADD CONSTRAINT "WorkshopInspectionItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopInspectionItem"
  ADD CONSTRAINT "WorkshopInspectionItem_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "WorkshopInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
