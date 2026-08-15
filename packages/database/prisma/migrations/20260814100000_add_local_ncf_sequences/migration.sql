-- Local NCF blocks (B01/B02) coexist with electronic e-CF blocks (E31/E32).
ALTER TYPE "InvoiceDocumentType" ADD VALUE IF NOT EXISTS 'FISCAL_CREDIT_01';
ALTER TYPE "InvoiceDocumentType" ADD VALUE IF NOT EXISTS 'CONSUMER_02';

ALTER TABLE "FiscalSequence"
  ADD COLUMN IF NOT EXISTS "authorizationNumber" TEXT;
