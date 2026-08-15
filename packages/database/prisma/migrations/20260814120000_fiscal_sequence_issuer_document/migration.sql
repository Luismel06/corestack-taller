ALTER TABLE "FiscalSequence"
  ADD COLUMN IF NOT EXISTS "issuerDocumentType" "DocumentType",
  ADD COLUMN IF NOT EXISTS "issuerDocumentNumber" TEXT;
