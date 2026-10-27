-- What the athlete said they did with a session's warm-up and stretches (ADR-115).
CREATE TYPE "RoutineStatus" AS ENUM ('DONE', 'SHORTENED', 'SKIPPED');

ALTER TABLE "PlannedSession" ADD COLUMN "warmupStatus" "RoutineStatus",
ADD COLUMN "cooldownStatus" "RoutineStatus";
