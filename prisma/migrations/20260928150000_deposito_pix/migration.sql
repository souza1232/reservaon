-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "depositAutoCancel" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "depositDeadlineMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "depositMode" TEXT NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "depositPixKey" TEXT,
ADD COLUMN     "depositPolicyText" TEXT,
ADD COLUMN     "depositValue" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "requiresDeposit" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "depositCents" INTEGER,
ADD COLUMN     "depositDueAt" TIMESTAMP(3),
ADD COLUMN     "depositStatus" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_depositStatus_depositDueAt_idx" ON "Appointment"("depositStatus", "depositDueAt");

