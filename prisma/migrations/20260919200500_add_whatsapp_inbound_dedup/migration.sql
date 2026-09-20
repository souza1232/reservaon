-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "whatsappMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_whatsappMessageId_key" ON "Notification"("whatsappMessageId");
