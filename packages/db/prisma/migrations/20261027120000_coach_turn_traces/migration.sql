-- Each coach turn as the model saw it, for the coach evals (ADR-117).
-- CreateTable
CREATE TABLE "CoachTurnTrace" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "conversationId" TEXT,
    "intent" TEXT NOT NULL,
    "model" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "finishReason" TEXT,
    "steps" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "cachedInputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "firstTextMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachTurnTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachTurnTrace_athleteId_createdAt_idx" ON "CoachTurnTrace"("athleteId", "createdAt");

-- AddForeignKey
ALTER TABLE "CoachTurnTrace" ADD CONSTRAINT "CoachTurnTrace_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

