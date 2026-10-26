-- A meal the athlete chose not to eat (ADR-113).
CREATE TABLE "FoodLogSkippedMeal" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "meal" "FoodMeal" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodLogSkippedMeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoodLogSkippedMeal_athleteId_date_meal_key" ON "FoodLogSkippedMeal"("athleteId", "date", "meal");

ALTER TABLE "FoodLogSkippedMeal" ADD CONSTRAINT "FoodLogSkippedMeal_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
