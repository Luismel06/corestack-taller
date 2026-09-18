ALTER TABLE "WorkshopTask" ADD COLUMN "category" TEXT;

CREATE INDEX "WorkshopTask_ticketId_category_idx"
ON "WorkshopTask"("ticketId", "category");
