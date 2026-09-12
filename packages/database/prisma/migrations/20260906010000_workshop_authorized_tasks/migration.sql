CREATE TYPE "WorkshopTaskKind" AS ENUM ('LEGACY', 'DIAGNOSIS', 'REPAIR');
ALTER TYPE "WorkshopTaskTimeEvent" ADD VALUE 'CANCEL';

-- Do not infer an authorization for existing free-text tasks.
ALTER TABLE "WorkshopTask"
  ADD COLUMN "kind" "WorkshopTaskKind" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "ticketLineId" TEXT,
  ADD COLUMN "pausedMinutes" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "WorkshopTicketLine_id_ticketId_key" ON "WorkshopTicketLine"("id", "ticketId");
CREATE INDEX "WorkshopTask_ticketLineId_ticketId_idx" ON "WorkshopTask"("ticketLineId", "ticketId");
ALTER TABLE "WorkshopTask" ADD CONSTRAINT "WorkshopTask_ticketLineId_ticketId_fkey"
  FOREIGN KEY ("ticketLineId", "ticketId") REFERENCES "WorkshopTicketLine"("id", "ticketId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopTask" ADD CONSTRAINT "WorkshopTask_kind_line_check"
  CHECK (("kind" = 'REPAIR' AND "ticketLineId" IS NOT NULL)
      OR ("kind" <> 'REPAIR' AND "ticketLineId" IS NULL));
