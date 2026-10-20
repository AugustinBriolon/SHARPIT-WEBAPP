-- DropForeignKey
ALTER TABLE "MyFitnessPalAccount" DROP CONSTRAINT IF EXISTS "MyFitnessPalAccount_athleteId_fkey";

-- DropTable
DROP TABLE IF EXISTS "MyFitnessPalAccount";
