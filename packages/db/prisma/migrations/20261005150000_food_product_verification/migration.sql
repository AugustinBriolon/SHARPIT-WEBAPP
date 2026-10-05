-- Food search: an Open Food Facts product given by its manufacturer or checked by a moderator (ADR-069).
CREATE TYPE "FoodVerification" AS ENUM ('PRODUCER', 'CHECKED');

ALTER TABLE "FoodProduct" ADD COLUMN "verification" "FoodVerification";
