-- ADR-125: derived tables keep the current state, not every run.

-- DecisionRecord: keep the latest run per (athlete, model, day).
DELETE FROM "DecisionRecord" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "athleteId", "modelId", "trainingDayId"
      ORDER BY "computedAt" DESC, "id" DESC
    ) AS rn
    FROM "DecisionRecord"
  ) ranked WHERE rn > 1
);

DROP INDEX "DecisionRecord_athleteId_modelId_idx";
CREATE UNIQUE INDEX "DecisionRecord_athleteId_modelId_trainingDayId_key"
  ON "DecisionRecord"("athleteId", "modelId", "trainingDayId");

-- FeatureSet: keep the latest COMPUTED version of each key and anything newer
-- (a newer INVALIDATED row still triggers the lazy recompute).
DELETE FROM "FeatureSet" f USING (
  SELECT "athleteId", "category", "trainingDayId", "sessionObsId",
    COALESCE(max("version") FILTER (WHERE "status" = 'COMPUTED'), max("version")) AS keep_from
  FROM "FeatureSet"
  GROUP BY 1, 2, 3, 4
) k
WHERE f."athleteId" = k."athleteId"
  AND f."category" = k."category"
  AND f."trainingDayId" IS NOT DISTINCT FROM k."trainingDayId"
  AND f."sessionObsId" IS NOT DISTINCT FROM k."sessionObsId"
  AND f."version" < k.keep_from;

-- Concurrent runs wrote the same version twice; keep one row per (key, version).
DELETE FROM "FeatureSet" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "athleteId", "category", "trainingDayId", "sessionObsId", "version"
      ORDER BY ("status" = 'COMPUTED') DESC, "createdAt" DESC, "id" DESC
    ) AS rn
    FROM "FeatureSet"
  ) ranked WHERE rn > 1
);

-- Observation without a source id: the same source re-reading the same instant is the
-- same measurement; keep the last one received.
DELETE FROM "Observation" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "athleteId", "type", "source", "timestamp"
      ORDER BY "receivedAt" DESC, "id" DESC
    ) AS rn
    FROM "Observation"
    WHERE "externalId" IS NULL
  ) ranked WHERE rn > 1
);
