-- When the day's caffeine was last noted (ADR-138), so « Fil de la journée » places the coffee at
-- its hour. Additive and nullable: days noted before read at the old fixed hour.
ALTER TABLE "AthleteDayJournal" ADD COLUMN "caffeineLoggedAt" TIMESTAMP(3);
