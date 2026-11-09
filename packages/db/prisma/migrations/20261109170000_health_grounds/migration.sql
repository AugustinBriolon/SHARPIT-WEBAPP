-- Health grounds: conditions with no single body zone and the stage the athlete is at (ADR-124).
CREATE TABLE "HealthGround" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthGround_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthGround_athleteId_key_key" ON "HealthGround"("athleteId", "key");
CREATE INDEX "HealthGround_athleteId_idx" ON "HealthGround"("athleteId");

ALTER TABLE "HealthGround" ADD CONSTRAINT "HealthGround_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
