-- A past day's activity mode, set after the fact. Additive: a new table, no existing row is touched.
CREATE TABLE "AthleteActivityStatusDay" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteActivityStatusDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteActivityStatusDay_athleteId_day_key" ON "AthleteActivityStatusDay"("athleteId", "day");

ALTER TABLE "AthleteActivityStatusDay" ADD CONSTRAINT "AthleteActivityStatusDay_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
