-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "mergedIntoId" TEXT,
ADD COLUMN "goalId" TEXT;

-- CreateIndex
CREATE INDEX "Activity_athleteId_mergedIntoId_idx" ON "Activity"("athleteId", "mergedIntoId");

-- CreateIndex
CREATE INDEX "Activity_goalId_idx" ON "Activity"("goalId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
