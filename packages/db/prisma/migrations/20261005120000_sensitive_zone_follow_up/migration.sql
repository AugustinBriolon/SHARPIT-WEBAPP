-- Sensitive zones follow-up (ADR-068): what the athlete can still do, and status changes on the timeline.
ALTER TABLE "PhysicalNote" ADD COLUMN "functionalImpact" "FunctionalImpact";
ALTER TABLE "PhysicalCheckin" ADD COLUMN "functionalImpact" "FunctionalImpact";
ALTER TABLE "PhysicalCheckin" ADD COLUMN "status" "PhysicalStatus";

-- Notes declared after the Phase 1 migration never got their Condition: backfill them.
INSERT INTO "Condition" (
  "id", "athleteId", "scope", "type", "bodyRegion", "side", "label", "diagnosis", "status",
  "severity", "confidence", "affectsTraining", "startedAt", "resolvedAt", "lastObservationAt",
  "observationCount", "legacyPhysicalNoteId", "createdAt", "updatedAt"
)
SELECT
  'cnd_' || n."id",
  n."athleteId",
  CASE WHEN coalesce(trim(n."bodyPart"), '') = '' AND n."category" IN ('MOBILITY', 'POSTURE')
    THEN 'SYSTEMIC'::"ConditionScope" ELSE 'LOCALIZED'::"ConditionScope" END,
  CASE n."category"
    WHEN 'PAIN' THEN 'PAIN'::"ConditionType"
    WHEN 'INJURY' THEN 'INJURY'::"ConditionType"
    WHEN 'MOBILITY' THEN 'MOBILITY_LIMITATION'::"ConditionType"
    WHEN 'POSTURE' THEN 'POSTURE_ISSUE'::"ConditionType"
    ELSE 'OTHER'::"ConditionType" END,
  coalesce(nullif(trim(n."bodyPart"), ''), n."title"),
  n."side",
  n."title",
  n."description",
  CASE n."status"
    WHEN 'MONITORING' THEN 'STABLE'::"ConditionStatus"
    WHEN 'RESOLVED' THEN 'RESOLVED'::"ConditionStatus"
    ELSE 'ACTIVE'::"ConditionStatus" END,
  coalesce(n."severity", 0),
  0.45,
  n."affectsTraining",
  n."startDate",
  n."resolvedAt",
  n."updatedAt",
  0,
  n."id",
  now(),
  now()
FROM "PhysicalNote" n
WHERE NOT EXISTS (SELECT 1 FROM "Condition" c WHERE c."legacyPhysicalNoteId" = n."id");

INSERT INTO "ConditionEpisode" ("id", "conditionId", "episodeNumber", "status", "startedAt", "resolvedAt", "peakSeverity")
SELECT
  'epi_' || c."id",
  c."id",
  1,
  CASE c."status" WHEN 'STABLE' THEN 'STABLE'::"EpisodeStatus" WHEN 'RESOLVED' THEN 'RESOLVED'::"EpisodeStatus" ELSE 'ACTIVE'::"EpisodeStatus" END,
  c."startedAt",
  c."resolvedAt",
  c."severity"
FROM "Condition" c
WHERE NOT EXISTS (SELECT 1 FROM "ConditionEpisode" e WHERE e."conditionId" = c."id");
