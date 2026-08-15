-- e-CF types remain modeled for a later phase; current operational invoices default to B02.
ALTER TABLE "Invoice"
  ALTER COLUMN "documentType" SET DEFAULT 'CONSUMER_02';
