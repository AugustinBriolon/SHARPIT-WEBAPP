-- Idempotency for coach tool approvals that write (e.g. logFoods): one row per athlete + toolCallId.
-- CreateTable
CREATE TABLE "CoachToolExecution" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachToolExecution_athleteId_idx" ON "CoachToolExecution"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachToolExecution_athleteId_toolCallId_key" ON "CoachToolExecution"("athleteId", "toolCallId");

-- AddForeignKey
ALTER TABLE "CoachToolExecution" ADD CONSTRAINT "CoachToolExecution_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
