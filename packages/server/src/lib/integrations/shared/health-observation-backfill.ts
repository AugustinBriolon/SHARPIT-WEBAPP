import { startOfDay, subDays } from 'date-fns';
import type { DailyHealth } from '@prisma/client';
import { garminHealthToObservations } from '@sharpit/server/adapters/garmin-health-adapter';
import type { ObservationSource, RawObservation } from '@sharpit/core/observation/types';
import type { GarminDailyHealth } from '@sharpit/server/lib/integrations/garmin/garmin';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { prisma } from '@sharpit/db/client';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';

export type HealthObservationBackfillResult = {
  scanned: number;
  ingested: number;
  skipped: number;
};

function dailyHealthToGarminHealth(row: DailyHealth): GarminDailyHealth {
  return {
    date: dayKeyFromDate(row.date),
    sleepMinutes: row.sleepMinutes,
    napMinutes: row.napMinutes,
    restingHr: row.restingHr,
    hrv: row.hrv,
    weightKg: row.weightKg,
    readinessScore: row.recoveryScore,
    readinessLevel: row.readinessLevel,
    readinessFeedback: row.readinessFeedback,
    readinessFactors: null,
    hrvStatus: row.hrvStatus,
    hrvBaselineLow: row.hrvBaselineLow,
    hrvBaselineHigh: row.hrvBaselineHigh,
    stress: row.stress,
    bodyBattery: row.bodyBattery,
    totalSteps: row.totalSteps,
    sleep: {
      sleepMinutes: row.sleepMinutes,
      napMinutes: row.napMinutes,
      sleepScore: row.sleepScore,
      sleepDeepMin: row.sleepDeepMin,
      sleepLightMin: row.sleepLightMin,
      sleepRemMin: row.sleepRemMin,
      sleepAwakeMin: row.sleepAwakeMin,
      sleepBedtimeMin: row.sleepBedtimeMin,
      sleepWakeMin: row.sleepWakeMin,
      sleepRespiration: row.sleepRespiration,
      sleepAvgStress: row.sleepAvgStress,
      sleepScoreFeedback: row.sleepScoreFeedback,
    },
  };
}

function filterMissingObservations(
  raws: RawObservation[],
  existingTypes: Set<string>,
): RawObservation[] {
  return raws.filter((raw) => !existingTypes.has(raw.type));
}

/**
 * Backfills Observation records from DailyHealth rows that predate the
 * Observation Engine pipeline (or missed ingest on prior syncs).
 */
export async function backfillHealthObservationsFromDailyHealth(
  athleteId: string,
  options?: { days?: number },
): Promise<HealthObservationBackfillResult> {
  const since = subDays(startOfDay(new Date()), options?.days ?? 365);
  const rows = await prisma.dailyHealth.findMany({
    where: { athleteId, date: { gte: since } },
    orderBy: { date: 'desc' },
  });
  return ingestDailyHealthObservations(athleteId, rows);
}

/**
 * Turns day rows into the Observations the Core reads (sleep, HRV, resting HR), for the
 * types a day does not hold yet. Apple Health's days go through here as they arrive, so an
 * athlete without Garmin still gets a readiness.
 */
export async function ingestDailyHealthObservations(
  athleteId: string,
  rows: DailyHealth[],
  source: ObservationSource = 'GARMIN',
): Promise<HealthObservationBackfillResult> {
  let ingested = 0;
  let skipped = 0;

  for (const row of rows) {
    const trainingDayId = dayKeyFromDate(row.date);
    const existing = await prisma.observation.findMany({
      where: {
        athleteId,
        trainingDayId,
        type: { in: ['HRV', 'RESTING_HR', 'SLEEP'] },
      },
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((o) => o.type));

    const health = dailyHealthToGarminHealth(row);
    const raws = filterMissingObservations(
      garminHealthToObservations(health, row.date, row.updatedAt, source),
      existingTypes,
    );

    if (raws.length === 0) {
      skipped += 1;
      continue;
    }

    const result = await observationEngine.ingestBatch(athleteId, raws);
    ingested += result.stats.accepted + result.stats.flagged;
  }

  return { scanned: rows.length, ingested, skipped };
}
