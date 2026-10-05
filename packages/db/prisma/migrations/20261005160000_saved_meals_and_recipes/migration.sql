-- Food log: meals kept to log again, and own foods made of other foods (ADR-071).
CREATE TABLE "SavedMeal" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedMeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedMeal_athleteId_idx" ON "SavedMeal"("athleteId");

ALTER TABLE "SavedMeal" ADD CONSTRAINT "SavedMeal_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FoodProduct" ADD COLUMN "recipe" JSONB;
