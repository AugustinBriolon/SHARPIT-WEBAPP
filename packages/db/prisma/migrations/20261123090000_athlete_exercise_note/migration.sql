-- A standing note the athlete keeps on one exercise (ADR-146). Additive: a new table, no existing
-- row is touched.
CREATE TABLE "AthleteExerciseNote" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "exerciseKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteExerciseNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteExerciseNote_athleteId_exerciseKey_key" ON "AthleteExerciseNote"("athleteId", "exerciseKey");

ALTER TABLE "AthleteExerciseNote" ADD CONSTRAINT "AthleteExerciseNote_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
