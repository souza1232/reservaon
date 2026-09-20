
-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'REVIEW_REQUEST';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "googleReviewUrl" TEXT;

