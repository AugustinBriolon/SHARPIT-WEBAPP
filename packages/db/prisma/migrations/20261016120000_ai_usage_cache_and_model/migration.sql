-- FinOps: persist prompt-cache hits and the model that served each call.
ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER;
ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "model" TEXT;
