import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { prisma } from '@sharpit/db/client';
import {
  parseMorningWellnessEntry,
  type MorningWellnessEntry,
} from '@sharpit/app/lib/journal/morning-wellness-entry';
import type { WellnessCheckinPayload } from '@sharpit/server/lib/validators/wellness-checkin';
import { onWellnessSubmitted } from '@sharpit/server/lib/athlete-state/orchestrator';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { resolveAthleteCalendarTimeZone } from '@sharpit/server/lib/integrations/apple-calendar/athlete-calendar-time-zone';
import { getLatestAthleteSnapshot } from '@sharpit/server/infrastructure/athlete-state/snapshot-repository';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import type { LimitingFactor, OverallVerdict } from '@sharpit/app/athlete-state/today-state';

export type { MorningWellnessEntry };

/**
 * Local training day for wellness / morning verdict.
 *
 * Same definition as FeatureEngine + daily-strain day matching:
 * `computeTrainingDayId(now, { timezone })` where
 * `timezone = GoogleAccount.timeZone ?? Europe/Paris`
 * (see `resolveAthleteCalendarTimeZone` / `AthleteContextProvider.fetchTimezone`).
 * Boundary: local midnight (`trainingDayStartHour` default 0).
 */
export async function resolveAthleteTrainingDayTimeZone(athleteId: string): Promise<string> {
  return resolveAthleteCalendarTimeZone(athleteId);
}

/** Today's YYYY-MM-DD in the athlete's training-day timezone (verdict day). */
export async function todayTrainingDayIdForAthlete(
  athleteId: string,
  date: Date = new Date(),
): Promise<string> {
  const timezone = await resolveAthleteTrainingDayTimeZone(athleteId);
  return trainingDayIdForNow({ timezone }, date);
}

/**
 * @deprecated Prefer `todayTrainingDayIdForAthlete` — Paris default, no athlete zone.
 * Kept for callers that have no athlete id yet (cron / shared helpers).
 */
export function todayTrainingDayId(date = new Date()): string {
  return trainingDayIdForNow({}, date);
}

export type WellnessCheckInStatus = {
  /** YYYY-MM-DD local training day (athlete timezone). */
  localDate: string;
  /** True when a morning (non-session) SUBJECTIVE MANUAL row exists for that day. */
  completed: boolean;
};

/**
 * Status-only read for the iOS « Ressenti du jour » half-sheet.
 * Never loads or returns scale values / notes (health data).
 * Strictly scoped to `athleteId` — callers must pass the session athlete only.
 */
export async function getWellnessCheckInStatus(
  athleteId: string,
  now: Date = new Date(),
): Promise<WellnessCheckInStatus> {
  const localDate = await todayTrainingDayIdForAthlete(athleteId, now);
  const completed = await hasMorningWellnessCheckin(athleteId, localDate);
  return { localDate, completed };
}

/** Codes-only verdict slice — safe to return on wellness POST (no scores / notes). */
export type WellnessVerdictSummary = {
  overallVerdict: OverallVerdict | null;
  limitingFactorSystem: LimitingFactor['system'];
  /** i18n code only (e.g. reasoning.limitingFactor.recovery.deficit). */
  limitingFactorCode: string | null;
  /**
   * Dimension limiter param when present (`autonomic` | `sleep` | `subjective` | `loadContext`).
   * iOS maps a low subjective dimension to the `subjective_low` card limiter.
   */
  limiter: string | null;
};

type LimitingLike = {
  system?: string | null;
  description?: { code?: string; params?: Record<string, string | number> } | null;
} | null;

function productSystem(system: string | null | undefined): LimitingFactor['system'] {
  if (system === 'RECOVERY' || system === 'FATIGUE' || system === 'ADAPTATION') {
    return system;
  }
  return null;
}

function limiterParam(limiting: LimitingLike): string | null {
  const raw = limiting?.description?.params?.limiter;
  if (raw === undefined || raw === null) {
    return null;
  }
  return String(raw);
}

export function verdictSummaryFromSnapshot(
  snapshot: AthleteSnapshot | null,
): WellnessVerdictSummary | null {
  if (!snapshot) {
    return null;
  }
  const limiting: LimitingLike =
    snapshot.limitingFactor ?? snapshot.decision?.limitingFactor ?? null;
  return {
    overallVerdict: snapshot.todaysDecision ?? snapshot.decision?.overallVerdict ?? null,
    limitingFactorSystem: productSystem(limiting?.system),
    limitingFactorCode: limiting?.description?.code ?? null,
    limiter: limiterParam(limiting),
  };
}

async function listMorningSubjectiveRows(athleteId: string, trainingDayId: string) {
  return prisma.observation.findMany({
    where: {
      athleteId,
      trainingDayId,
      type: 'SUBJECTIVE',
      source: 'MANUAL',
    },
    orderBy: { timestamp: 'desc' },
    select: { data: true },
  });
}

/** A morning check-in, as opposed to the feeling attached to one session. */
export function isNonSessionSubjective(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }
  return !(
    'sessionExternalId' in data && (data as { sessionExternalId?: unknown }).sessionExternalId
  );
}

/** Latest morning (non-session) SUBJECTIVE MANUAL entry with full scales, if any. */
export async function getMorningWellnessCheckin(
  athleteId: string,
  trainingDayId: string,
): Promise<MorningWellnessEntry | null> {
  const rows = await listMorningSubjectiveRows(athleteId, trainingDayId);

  for (const row of rows) {
    const entry = parseMorningWellnessEntry(row.data);
    if (entry) {
      return entry;
    }
  }

  return null;
}

export async function hasMorningWellnessCheckin(
  athleteId: string,
  trainingDayId: string,
): Promise<boolean> {
  const rows = await listMorningSubjectiveRows(athleteId, trainingDayId);
  return rows.some((row) => isNonSessionSubjective(row.data));
}

export type SubmitMorningWellnessResult = {
  alreadyCompleted: boolean;
  localDate: string;
  /** Updated (or cached) verdict after save; null when no snapshot is available yet. */
  verdict: WellnessVerdictSummary | null;
};

async function loadVerdictSummary(
  athleteId: string,
  trainingDayId: string,
): Promise<WellnessVerdictSummary | null> {
  const snapshot = await getLatestAthleteSnapshot({ athleteId, trainingDayId });
  return verdictSummaryFromSnapshot(snapshot);
}

export async function submitMorningWellnessCheckin(
  athleteId: string,
  trainingDayId: string,
  payload: WellnessCheckinPayload,
): Promise<SubmitMorningWellnessResult> {
  if (await hasMorningWellnessCheckin(athleteId, trainingDayId)) {
    return {
      alreadyCompleted: true,
      localDate: trainingDayId,
      verdict: await loadVerdictSummary(athleteId, trainingDayId),
    };
  }

  const timezone = await resolveAthleteTrainingDayTimeZone(athleteId);
  const now = new Date();
  const result = await observationEngine.ingest(
    athleteId,
    {
      type: 'SUBJECTIVE',
      source: 'MANUAL',
      timestamp: now,
      receivedAt: now,
      mood: payload.mood,
      energyLevel: payload.energyLevel,
      perceivedSoreness: payload.perceivedSoreness,
      stressLevel: payload.stressLevel,
      notes: payload.notes ?? undefined,
    },
    { timezone },
  );

  if (result.status === 'REJECTED') {
    throw new Error(`Observation rejetée (${result.reason.code})`);
  }

  const snapshot = await onWellnessSubmitted(athleteId, trainingDayId);

  // Best-effort: evaluate morning session recalibration after Twin refresh.
  try {
    const { refreshMorningRecalibrationAfterCheckIn } =
      await import('@sharpit/server/lib/morning-recalibration/service');
    await refreshMorningRecalibrationAfterCheckIn(athleteId, trainingDayId);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    console.error(
      '[wellness-checkin/morning-recalibration]',
      error instanceof Error ? error.name : 'unknown',
      code,
    );
  }

  return {
    alreadyCompleted: false,
    localDate: trainingDayId,
    verdict: verdictSummaryFromSnapshot(snapshot),
  };
}
