CREATE TYPE "WorkshopAppointmentStatus" AS ENUM (
  'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED', 'CONVERTED_TO_RECEPTION'
);

CREATE TABLE "WorkshopAppointment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "mechanicId" TEXT,
  "createdById" TEXT NOT NULL,
  "convertedTicketId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "estimatedMinutes" INTEGER NOT NULL DEFAULT 60,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "status" "WorkshopAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopAppointment_convertedTicketId_key" ON "WorkshopAppointment"("convertedTicketId");
CREATE INDEX "WorkshopAppointment_tenantId_startsAt_idx" ON "WorkshopAppointment"("tenantId", "startsAt");
CREATE INDEX "WorkshopAppointment_tenantId_status_startsAt_idx" ON "WorkshopAppointment"("tenantId", "status", "startsAt");
CREATE INDEX "WorkshopAppointment_customerId_idx" ON "WorkshopAppointment"("customerId");
CREATE INDEX "WorkshopAppointment_vehicleId_idx" ON "WorkshopAppointment"("vehicleId");
CREATE INDEX "WorkshopAppointment_mechanicId_startsAt_idx" ON "WorkshopAppointment"("mechanicId", "startsAt");
CREATE INDEX "WorkshopAppointment_createdById_idx" ON "WorkshopAppointment"("createdById");

ALTER TABLE "WorkshopAppointment"
  ADD CONSTRAINT "WorkshopAppointment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopAppointment"
  ADD CONSTRAINT "WorkshopAppointment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopAppointment"
  ADD CONSTRAINT "WorkshopAppointment_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "WorkshopVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopAppointment"
  ADD CONSTRAINT "WorkshopAppointment_mechanicId_fkey"
  FOREIGN KEY ("mechanicId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopAppointment"
  ADD CONSTRAINT "WorkshopAppointment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopAppointment"
  ADD CONSTRAINT "WorkshopAppointment_convertedTicketId_fkey"
  FOREIGN KEY ("convertedTicketId") REFERENCES "WorkshopTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
