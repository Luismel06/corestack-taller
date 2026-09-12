ALTER TABLE "WorkshopTicketLine" ADD COLUMN "approvalStatus" "WorkshopApprovalStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE "WorkshopQuoteVersion" ADD COLUMN "decision" JSONB;
ALTER TABLE "WorkshopChangeOrder" ADD COLUMN "decision" JSONB;

-- Only complete historical approvals prove that every line was authorized.
-- Historical partial approvals require review; never infer accepted line IDs.
UPDATE "WorkshopTicketLine" AS line
SET "approvalStatus" = 'APPROVED'
FROM "WorkshopTicket" AS ticket
WHERE line."ticketId" = ticket."id" AND ticket."approvalStatus" = 'APPROVED';

UPDATE "WorkshopTicketLine" AS line
SET "approvalStatus" = 'PENDING'
FROM "WorkshopTicket" AS ticket
WHERE line."ticketId" = ticket."id" AND ticket."approvalStatus" = 'PENDING';
