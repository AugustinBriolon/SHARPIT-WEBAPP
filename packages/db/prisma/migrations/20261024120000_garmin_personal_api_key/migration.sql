-- Garmin returns through the official Personal API: one encrypted API key per athlete, write-only.
CREATE TABLE IF NOT EXISTS "GarminAccount" (
    "athleteId" TEXT NOT NULL,
    "displayName" TEXT,
    "fullName" TEXT,
    "apiKeyEnc" TEXT NOT NULL,
    "apiKeyLast4" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastActivitySyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarminAccount_pkey" PRIMARY KEY ("athleteId")
);

ALTER TABLE "GarminAccount" ADD CONSTRAINT "GarminAccount_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
