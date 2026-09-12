-- DropIndex
DROP INDEX "Product_tenantId_reservedStock_idx";

-- DropIndex
DROP INDEX "SalesOrder_tenantId_destination_status_idx";

-- AlterTable
ALTER TABLE "ReturnRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "WorkshopAdvance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "cashSessionId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "paymentId" TEXT,
    "invoiceId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT,
    "supplierId" TEXT,
    "requestKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "reference" TEXT,
    "cashSessionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopExternalJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketLineId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "billedPrice" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "expenseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "WorkshopExternalJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopWarranty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketLineId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "mileageLimit" INTEGER,
    "conditions" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopWarranty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopWarrantyClaim" (
    "id" TEXT NOT NULL,
    "warrantyId" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "mileage" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "repairTicketId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WorkshopWarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopMaintenance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "originTicketId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "dueMileage" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "completedTicketId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopAdvance_paymentId_key" ON "WorkshopAdvance"("paymentId");

-- CreateIndex
CREATE INDEX "WorkshopAdvance_tenantId_ticketId_status_idx" ON "WorkshopAdvance"("tenantId", "ticketId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopAdvance_tenantId_requestKey_key" ON "WorkshopAdvance"("tenantId", "requestKey");

-- CreateIndex
CREATE INDEX "WorkshopExpense_tenantId_incurredAt_status_idx" ON "WorkshopExpense"("tenantId", "incurredAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopExpense_tenantId_requestKey_key" ON "WorkshopExpense"("tenantId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopExternalJob_expenseId_key" ON "WorkshopExternalJob"("expenseId");

-- CreateIndex
CREATE INDEX "WorkshopExternalJob_tenantId_status_idx" ON "WorkshopExternalJob"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopExternalJob_ticketLineId_key" ON "WorkshopExternalJob"("ticketLineId");

-- CreateIndex
CREATE INDEX "WorkshopWarranty_tenantId_expiresAt_idx" ON "WorkshopWarranty"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopWarranty_tenantId_ticketLineId_key" ON "WorkshopWarranty"("tenantId", "ticketLineId");

-- CreateIndex
CREATE INDEX "WorkshopWarrantyClaim_warrantyId_status_idx" ON "WorkshopWarrantyClaim"("warrantyId", "status");

-- CreateIndex
CREATE INDEX "WorkshopMaintenance_tenantId_vehicleId_status_idx" ON "WorkshopMaintenance"("tenantId", "vehicleId", "status");

-- CreateIndex
CREATE INDEX "WorkshopMaintenance_tenantId_dueAt_idx" ON "WorkshopMaintenance"("tenantId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopTicket_tenantId_id_key" ON "WorkshopTicket"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "WorkshopAdvance" ADD CONSTRAINT "WorkshopAdvance_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "WorkshopTicket"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopExpense" ADD CONSTRAINT "WorkshopExpense_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "WorkshopTicket"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopExternalJob" ADD CONSTRAINT "WorkshopExternalJob_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "WorkshopTicket"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopExternalJob" ADD CONSTRAINT "WorkshopExternalJob_ticketLineId_ticketId_fkey" FOREIGN KEY ("ticketLineId", "ticketId") REFERENCES "WorkshopTicketLine"("id", "ticketId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopExternalJob" ADD CONSTRAINT "WorkshopExternalJob_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "WorkshopExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWarranty" ADD CONSTRAINT "WorkshopWarranty_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "WorkshopTicket"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWarranty" ADD CONSTRAINT "WorkshopWarranty_ticketLineId_ticketId_fkey" FOREIGN KEY ("ticketLineId", "ticketId") REFERENCES "WorkshopTicketLine"("id", "ticketId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWarrantyClaim" ADD CONSTRAINT "WorkshopWarrantyClaim_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "WorkshopWarranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopMaintenance" ADD CONSTRAINT "WorkshopMaintenance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "WorkshopVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
