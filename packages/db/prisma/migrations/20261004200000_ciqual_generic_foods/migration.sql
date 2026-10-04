-- Generic foods from the ANSES Ciqual table (ADR-065), cached as products like Open Food Facts.
ALTER TYPE "FoodProductSource" ADD VALUE 'CIQUAL';
ALTER TABLE "FoodProduct" ADD COLUMN "ciqualCode" INTEGER;
CREATE UNIQUE INDEX "FoodProduct_ciqualCode_key" ON "FoodProduct"("ciqualCode");
