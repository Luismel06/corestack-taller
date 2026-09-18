CREATE TYPE "WorkshopVehicleAreaCondition" AS ENUM ('OK', 'ATTENTION', 'REPAIR');

ALTER TABLE "WorkshopTicketLine"
ADD COLUMN "vehicleAreaId" TEXT;

ALTER TABLE "WorkshopChangeOrderLine"
ADD COLUMN "vehicleAreaId" TEXT;

CREATE TABLE "WorkshopVehicleAreaFinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "areaLabel" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "condition" "WorkshopVehicleAreaCondition" NOT NULL,
    "finding" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopVehicleAreaFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkshopVehicleAreaFinding_ticketId_areaId_key"
ON "WorkshopVehicleAreaFinding"("ticketId", "areaId");

CREATE INDEX "WorkshopVehicleAreaFinding_tenantId_condition_idx"
ON "WorkshopVehicleAreaFinding"("tenantId", "condition");

CREATE INDEX "WorkshopVehicleAreaFinding_ticketId_idx"
ON "WorkshopVehicleAreaFinding"("ticketId");

CREATE INDEX "WorkshopTicketLine_ticketId_vehicleAreaId_idx"
ON "WorkshopTicketLine"("ticketId", "vehicleAreaId");

CREATE INDEX "WorkshopChangeOrderLine_changeOrderId_vehicleAreaId_idx"
ON "WorkshopChangeOrderLine"("changeOrderId", "vehicleAreaId");

ALTER TABLE "WorkshopVehicleAreaFinding"
ADD CONSTRAINT "WorkshopVehicleAreaFinding_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkshopVehicleAreaFinding"
ADD CONSTRAINT "WorkshopVehicleAreaFinding_ticketId_fkey"
FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
