CREATE TABLE "WorkshopTicketStatusEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatus" "WorkshopTicketStatus",
    "toStatus" "WorkshopTicketStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkshopTicketStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkshopTicketStatusEvent_tenantId_createdAt_idx" ON "WorkshopTicketStatusEvent"("tenantId", "createdAt");
CREATE INDEX "WorkshopTicketStatusEvent_ticketId_createdAt_idx" ON "WorkshopTicketStatusEvent"("ticketId", "createdAt");
CREATE INDEX "WorkshopTicketStatusEvent_createdById_idx" ON "WorkshopTicketStatusEvent"("createdById");

ALTER TABLE "WorkshopTicketStatusEvent" ADD CONSTRAINT "WorkshopTicketStatusEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicketStatusEvent" ADD CONSTRAINT "WorkshopTicketStatusEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "WorkshopTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopTicketStatusEvent" ADD CONSTRAINT "WorkshopTicketStatusEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
