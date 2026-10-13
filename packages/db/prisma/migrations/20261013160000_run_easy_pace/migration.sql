-- Allure Z2 / endurance editable (s/km). When null, coach derives from runThresholdPaceSecPerKm.
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "runEasyPaceSecPerKm" DOUBLE PRECISION;
