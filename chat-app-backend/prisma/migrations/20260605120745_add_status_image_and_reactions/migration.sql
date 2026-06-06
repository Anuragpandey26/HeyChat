-- AlterEnum
ALTER TYPE "StatusType" ADD VALUE 'IMAGE';

-- AlterTable
ALTER TABLE "Status" ADD COLUMN     "mediaUrl" VARCHAR(500);

-- AlterTable
ALTER TABLE "StatusView" ADD COLUMN     "emoji" VARCHAR(10);
