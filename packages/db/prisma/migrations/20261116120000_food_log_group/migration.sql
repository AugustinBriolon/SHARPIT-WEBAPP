-- Foods logged together as one named meal (ADR-134). Additive: no existing row is rewritten,
-- every entry already logged stays ungrouped.
CREATE TABLE "FoodLogGroup" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodLogGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FoodLogGroup_athleteId_idx" ON "FoodLogGroup"("athleteId");

ALTER TABLE "FoodLogGroup" ADD CONSTRAINT "FoodLogGroup_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FoodLogEntry" ADD COLUMN "groupId" TEXT;

CREATE INDEX "FoodLogEntry_groupId_idx" ON "FoodLogEntry"("groupId");

ALTER TABLE "FoodLogEntry" ADD CONSTRAINT "FoodLogEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FoodLogGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
