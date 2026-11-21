-- When the day's last coffee was had (ADR-138), minutes after local midnight, so « Fil de la
-- journée » and the journal analysis read it at its hour. Additive and nullable: days noted before
-- read at the old fixed hour.
ALTER TABLE "AthleteDayJournal" ADD COLUMN "caffeineMinute" INTEGER;
