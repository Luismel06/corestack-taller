CREATE TYPE "WorkshopApprovalStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED');
CREATE TYPE "WorkshopTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

ALTER TABLE "WorkshopTicket"
  ADD COLUMN "approvalStatus" "WorkshopApprovalStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "approvalNote" TEXT,
  ADD COLUMN "approvalRequestedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "salesOrderId" TEXT;

ALTER TABLE "WorkshopTicketLine"
  ADD COLUMN "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "WorkshopTask" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "employeeId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "WorkshopTaskStatus" NOT NULL DEFAULT 'PENDING',
  "estimatedMinutes" INTEGER,
  "actualMinutes" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopTicket_salesOrderId_key" ON "WorkshopTicket"("salesOrderId");
CREATE INDEX "WorkshopTicket_tenantId_approvalStatus_idx" ON "WorkshopTicket"("tenantId", "approvalStatus");
CREATE INDEX "WorkshopTask_ticketId_status_idx" ON "WorkshopTask"("ticketId", "status");
CREATE INDEX "WorkshopTask_employeeId_status_idx" ON "WorkshopTask"("employeeId", "status");

ALTER TABLE "WorkshopTicket"
  ADD CONSTRAINT "WorkshopTicket_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkshopTask"
  ADD CONSTRAINT "WorkshopTask_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkshopTask_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
