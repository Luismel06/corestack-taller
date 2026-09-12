ALTER TYPE "Role" ADD VALUE 'MECHANIC';

CREATE TYPE "WorkshopTicketStatus" AS ENUM ('RECEIVED', 'DIAGNOSIS', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
CREATE TYPE "WorkshopTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "WorkshopTicketLineType" AS ENUM ('LABOR', 'PART', 'OTHER');

CREATE TABLE "WorkshopVehicle" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
  "licensePlate" TEXT, "make" TEXT NOT NULL, "model" TEXT NOT NULL, "year" INTEGER,
  "color" TEXT, "vin" TEXT, "mileage" INTEGER, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopVehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkshopTicket" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL, "ticketNumber" TEXT NOT NULL,
  "status" "WorkshopTicketStatus" NOT NULL DEFAULT 'RECEIVED',
  "priority" "WorkshopTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "complaint" TEXT NOT NULL, "diagnosis" TEXT, "internalNotes" TEXT, "customerNotes" TEXT,
  "estimatedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0, "laborTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "partsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0, "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "promisedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkshopTicketAssignment" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "WorkshopTicketAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkshopTicketLine" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "productId" TEXT,
  "type" "WorkshopTicketLineType" NOT NULL, "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1, "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WorkshopTicketLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopVehicle_tenantId_licensePlate_key" ON "WorkshopVehicle"("tenantId", "licensePlate");
CREATE INDEX "WorkshopVehicle_tenantId_customerId_idx" ON "WorkshopVehicle"("tenantId", "customerId");
CREATE INDEX "WorkshopVehicle_tenantId_make_model_idx" ON "WorkshopVehicle"("tenantId", "make", "model");
CREATE UNIQUE INDEX "WorkshopTicket_tenantId_ticketNumber_key" ON "WorkshopTicket"("tenantId", "ticketNumber");
CREATE INDEX "WorkshopTicket_tenantId_status_priority_idx" ON "WorkshopTicket"("tenantId", "status", "priority");
CREATE INDEX "WorkshopTicket_tenantId_customerId_idx" ON "WorkshopTicket"("tenantId", "customerId");
CREATE INDEX "WorkshopTicket_tenantId_vehicleId_idx" ON "WorkshopTicket"("tenantId", "vehicleId");
CREATE INDEX "WorkshopTicket_createdById_idx" ON "WorkshopTicket"("createdById");
CREATE UNIQUE INDEX "WorkshopTicketAssignment_ticketId_employeeId_key" ON "WorkshopTicketAssignment"("ticketId", "employeeId");
CREATE INDEX "WorkshopTicketAssignment_employeeId_assignedAt_idx" ON "WorkshopTicketAssignment"("employeeId", "assignedAt");
CREATE INDEX "WorkshopTicketLine_ticketId_idx" ON "WorkshopTicketLine"("ticketId");
CREATE INDEX "WorkshopTicketLine_productId_idx" ON "WorkshopTicketLine"("productId");

ALTER TABLE "WorkshopVehicle" ADD CONSTRAINT "WorkshopVehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopVehicle" ADD CONSTRAINT "WorkshopVehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicket" ADD CONSTRAINT "WorkshopTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicket" ADD CONSTRAINT "WorkshopTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicket" ADD CONSTRAINT "WorkshopTicket_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "WorkshopVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicket" ADD CONSTRAINT "WorkshopTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicketAssignment" ADD CONSTRAINT "WorkshopTicketAssignment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicketAssignment" ADD CONSTRAINT "WorkshopTicketAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicketLine" ADD CONSTRAINT "WorkshopTicketLine_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicketLine" ADD CONSTRAINT "WorkshopTicketLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
