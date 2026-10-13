-- CreateEnum
CREATE TYPE "RaceDiscipline" AS ENUM ('RUN', 'TRAIL', 'BIKE', 'SWIM', 'TRIATHLON', 'DUATHLON', 'SWIMRUN');

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "discipline" "RaceDiscipline",
ADD COLUMN "formatKey" TEXT,
ADD COLUMN "swimM" INTEGER,
ADD COLUMN "bikeM" INTEGER,
ADD COLUMN "runM" INTEGER,
ADD COLUMN "run2M" INTEGER,
ADD COLUMN "segments" INTEGER,
ADD COLUMN "bikeElevationM" INTEGER,
ADD COLUMN "runElevationM" INTEGER,
ADD COLUMN "openWater" BOOLEAN,
ADD COLUMN "targetSeconds" INTEGER;
