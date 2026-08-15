ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "electronicInvoiceRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ecfRecipientEmail" TEXT;
