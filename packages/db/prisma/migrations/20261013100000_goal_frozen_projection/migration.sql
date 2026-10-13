-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "frozenProjection" JSONB,
ADD COLUMN "frozenProjectionAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GoalProjectionSnapshot" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "finishSec" INTEGER NOT NULL,
    "todaySec" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalProjectionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoalProjectionSnapshot_goalId_weekKey_key" ON "GoalProjectionSnapshot"("goalId", "weekKey");

-- AddForeignKey
ALTER TABLE "GoalProjectionSnapshot" ADD CONSTRAINT "GoalProjectionSnapshot_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
