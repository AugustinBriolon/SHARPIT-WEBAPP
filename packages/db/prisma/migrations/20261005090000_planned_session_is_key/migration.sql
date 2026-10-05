-- Key sessions: the two or three sessions of a week that matter most.
ALTER TABLE "PlannedSession" ADD COLUMN "isKey" BOOLEAN NOT NULL DEFAULT false;
