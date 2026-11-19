-- When a food was eaten (ADR-137): minutes after the training day's local midnight. Additive and
-- nullable: every entry already logged keeps no time and reads at its meal's usual hour.
ALTER TABLE "FoodLogEntry" ADD COLUMN "eatenMinute" INTEGER;
