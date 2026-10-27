-- The answer of each coach turn with its tool calls and their outputs, for the coach evals (ADR-117).
-- AlterTable
ALTER TABLE "CoachTurnTrace" ADD COLUMN "turn" JSONB;
