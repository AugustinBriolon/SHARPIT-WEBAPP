-- Garmin moves from the Personal API key to the Connect Developer Program OAuth (ADR-105).
-- A stored key cannot become OAuth tokens: those rows are dropped and the athlete connects again.
DELETE FROM "GarminAccount";

ALTER TABLE "GarminAccount" DROP COLUMN "apiKeyEnc",
DROP COLUMN "apiKeyLast4",
ADD COLUMN "garminUserId" TEXT NOT NULL,
ADD COLUMN "accessTokenEnc" TEXT NOT NULL,
ADD COLUMN "refreshTokenEnc" TEXT NOT NULL,
ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "GarminAccount_garminUserId_key" ON "GarminAccount"("garminUserId");

CREATE TABLE "GarminPushInbox" (
    "id" TEXT NOT NULL,
    "summaryType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "GarminPushInbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GarminPushInbox_processedAt_receivedAt_idx" ON "GarminPushInbox"("processedAt", "receivedAt");
