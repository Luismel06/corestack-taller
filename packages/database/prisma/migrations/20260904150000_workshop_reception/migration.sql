CREATE TABLE "WorkshopReception" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "mileage" INTEGER NOT NULL,
  "fuelLevel" TEXT,
  "accessories" TEXT,
  "belongings" TEXT,
  "exteriorCondition" TEXT,
  "interiorCondition" TEXT,
  "warningLights" TEXT,
  "observations" TEXT,
  "bay" TEXT,
  "initialMechanicId" TEXT,
  "createdById" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkshopReception_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopReception_ticketId_key" ON "WorkshopReception"("ticketId");
CREATE INDEX "WorkshopReception_tenantId_receivedAt_idx" ON "WorkshopReception"("tenantId", "receivedAt");
CREATE INDEX "WorkshopReception_initialMechanicId_idx" ON "WorkshopReception"("initialMechanicId");
CREATE INDEX "WorkshopReception_createdById_idx" ON "WorkshopReception"("createdById");

ALTER TABLE "WorkshopReception"
  ADD CONSTRAINT "WorkshopReception_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopReception"
  ADD CONSTRAINT "WorkshopReception_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopReception"
  ADD CONSTRAINT "WorkshopReception_initialMechanicId_fkey"
  FOREIGN KEY ("initialMechanicId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopReception"
  ADD CONSTRAINT "WorkshopReception_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
