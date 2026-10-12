-- AlterEnum: durable Coach Memory types (ADR-080)
ALTER TYPE "AthleteMemoryEntryType" ADD VALUE IF NOT EXISTS 'INJURY';
ALTER TYPE "AthleteMemoryEntryType" ADD VALUE IF NOT EXISTS 'PREFERENCE';
ALTER TYPE "AthleteMemoryEntryType" ADD VALUE IF NOT EXISTS 'NOTE';
