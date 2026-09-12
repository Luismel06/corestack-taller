ALTER TABLE "Invoice" ADD COLUMN "checkoutKey" TEXT, ADD COLUMN "checkoutRequestHash" TEXT;
ALTER TABLE "Payment" ADD COLUMN "reference" TEXT;
CREATE UNIQUE INDEX "Invoice_tenantId_checkoutKey_key" ON "Invoice"("tenantId", "checkoutKey");
