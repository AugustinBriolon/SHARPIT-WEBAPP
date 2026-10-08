-- CreateTable
CREATE TABLE "CalendarBusySnapshot" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "intervals" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBusySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarBusySnapshot_athleteId_idx" ON "CalendarBusySnapshot"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarBusySnapshot_athleteId_provider_key" ON "CalendarBusySnapshot"("athleteId", "provider");

-- AddForeignKey
ALTER TABLE "CalendarBusySnapshot" ADD CONSTRAINT "CalendarBusySnapshot_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
