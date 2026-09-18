ALTER TABLE "WorkshopReception"
  DROP CONSTRAINT IF EXISTS "WorkshopReception_bayId_fkey";

DROP INDEX IF EXISTS "WorkshopReception_bayId_idx";

ALTER TABLE "WorkshopReception"
  DROP COLUMN IF EXISTS "bayId",
  DROP COLUMN IF EXISTS "bay",
  ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DROP TABLE IF EXISTS "WorkshopBay";
DROP TYPE IF EXISTS "WorkshopBayStatus";
