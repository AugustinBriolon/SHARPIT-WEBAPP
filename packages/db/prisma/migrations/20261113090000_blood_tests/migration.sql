-- Blood tests: one sealed (AES-GCM) payload of results per test, no document kept (ADR-128).
CREATE TABLE "BloodTest" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL,
    "sealedResults" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloodTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BloodTest_athleteId_sampledAt_idx" ON "BloodTest"("athleteId", "sampledAt");

ALTER TABLE "BloodTest" ADD CONSTRAINT "BloodTest_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
