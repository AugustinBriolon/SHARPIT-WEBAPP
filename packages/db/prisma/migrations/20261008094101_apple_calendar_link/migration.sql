-- Apple Calendar has no account to connect: the iPhone app says when EventKit is linked.
ALTER TABLE "AthleteProfile" ADD COLUMN "appleCalendarLinkedAt" TIMESTAMP(3);
