-- « Donner un avis »: what athletes write from the app during the beta.
CREATE TABLE "AthleteFeedback" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AthleteFeedback_athleteId_createdAt_idx" ON "AthleteFeedback"("athleteId", "createdAt");

ALTER TABLE "AthleteFeedback" ADD CONSTRAINT "AthleteFeedback_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
