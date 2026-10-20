-- DropForeignKey
ALTER TABLE "GarminAccount" DROP CONSTRAINT IF EXISTS "GarminAccount_athleteId_fkey";

-- DropTable
DROP TABLE IF EXISTS "GarminAccount";
