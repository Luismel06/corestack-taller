ALTER TYPE "WorkshopTaskStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
CREATE TYPE "WorkshopTaskTimeEvent" AS ENUM ('START', 'PAUSE', 'RESUME', 'COMPLETE');

CREATE TABLE "WorkshopTaskTimeEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "event" "WorkshopTaskTimeEvent" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkshopTaskTimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkshopTaskTimeEntry_tenantId_occurredAt_idx" ON "WorkshopTaskTimeEntry"("tenantId", "occurredAt");
CREATE INDEX "WorkshopTaskTimeEntry_taskId_occurredAt_idx" ON "WorkshopTaskTimeEntry"("taskId", "occurredAt");
CREATE INDEX "WorkshopTaskTimeEntry_userId_occurredAt_idx" ON "WorkshopTaskTimeEntry"("userId", "occurredAt");

ALTER TABLE "WorkshopTaskTimeEntry"
  ADD CONSTRAINT "WorkshopTaskTimeEntry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTaskTimeEntry"
  ADD CONSTRAINT "WorkshopTaskTimeEntry_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "WorkshopTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTaskTimeEntry"
  ADD CONSTRAINT "WorkshopTaskTimeEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
