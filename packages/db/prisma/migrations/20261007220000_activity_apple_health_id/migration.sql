-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "appleHealthId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Activity_appleHealthId_key" ON "Activity"("appleHealthId");
