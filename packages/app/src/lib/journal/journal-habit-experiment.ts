/**
 * 7-day journal habit experiments, derived entirely at read time (ADR-032).
 *
 * Only the intent and the window are stored. Progress, review date and verdict
 * follow from the journal and DailyHealth with the same method as habit
 * associations — medians, `MIN_ABS_DELTA`, `scoreObservationConfidence` — so a
 * test never uses a second engine or an ad-hoc threshold.
 */

import {
  MIN_N_PER_GROUP_HIGH,
  OUTCOMES,
  median,
  outcomeLagDays,
  scoreObservationConfidence,
  type JournalOutcomeKey,
  type ObservationConfidence,
  type RecordedFactor,
} from '@sharpit/app/lib/journal/journal-habit-analysis';
import { isDayContextFactorId } from '@sharpit/app/lib/journal/day-context-factors';
import {
  isCustomTrackableId,
  journalTrackableById,
} from '@sharpit/app/lib/journal/journal-trackables';
import { addTrainingDays } from '@sharpit/core/training/training-day';

export const EXPERIMENT_WINDOW_DAYS = 7;

/** Days before the window whose medians the test is compared against. */
export const EXPERIMENT_BASELINE_DAYS = 21;

/** A window with fewer held days was not kept: same bar as a net association group. */
export const EXPERIMENT_MIN_HELD_DAYS = MIN_N_PER_GROUP_HIGH;

export type ExperimentIntent = 'REMOVE' | 'ADD';

export const ONE_TEST_AT_A_TIME_MESSAGE = 'Un test est déjà en cours : un seul levier à la fois.';

/** An unfavourable habit is tested by dropping it, a favourable one by keeping it daily. */
export function experimentIntentForPolarity(polarity: 'plus' | 'minus'): ExperimentIntent {
  return polarity === 'minus' ? 'REMOVE' : 'ADD';
}

/** Only factors the journal can record may be tested. */
export function isExperimentFactorId(factorId: string): boolean {
  return (
    isDayContextFactorId(factorId) ||
    journalTrackableById(factorId) !== undefined ||
    isCustomTrackableId(factorId)
  );
}
export type ExperimentVerdict = 'worked' | 'no_effect' | 'abandoned';
export type ExperimentDaySegment = 'held' | 'missed' | 'pending';

export type ExperimentRecord = {
  id: string;
  factorId: string;
  intent: ExperimentIntent;
  startDayId: string;
  cancelledAt: Date | null;
};

export type ExperimentEvidence = {
  factorsByDay: ReadonlyMap<string, Readonly<Record<string, RecordedFactor | null>>>;
  outcomesByDay: Readonly<Record<JournalOutcomeKey, ReadonlyMap<string, number>>>;
};

export type ExperimentEffect = {
  outcome: JournalOutcomeKey;
  /** Window median minus baseline median — higher is better for every outcome. */
  delta: number;
  nWindow: number;
  nBaseline: number;
  confidence: ObservationConfidence;
};

export type EvaluatedExperiment = {
  id: string;
  factorId: string;
  intent: ExperimentIntent;
  startDayId: string;
  endDayId: string;
  reviewDayId: string;
  status: 'running' | 'reviewed';
  /** 1–7, day of the window the athlete is on (capped once it ends). */
  dayIndex: number;
  segments: ExperimentDaySegment[];
  heldDays: number;
  verdict: ExperimentVerdict | null;
  effects: ExperimentEffect[];
};

const HELD_STATE: Record<ExperimentIntent, RecordedFactor> = { REMOVE: 'no', ADD: 'yes' };

const DAY_MS = 86_400_000;

function dayRange(startDayId: string, length: number): string[] {
  return Array.from({ length }, (_, index) => addTrainingDays(startDayId, index));
}

function maxOutcomeLag(factorId: string): number {
  return outcomeLagDays(factorId);
}

/** The morning the last window day's outcome is measured — the review is automatic from then. */
export function experimentReviewDayId(
  record: Pick<ExperimentRecord, 'factorId' | 'startDayId'>,
): string {
  return addTrainingDays(
    record.startDayId,
    EXPERIMENT_WINDOW_DAYS + maxOutcomeLag(record.factorId),
  );
}

function daySegment(
  dayId: string,
  record: ExperimentRecord,
  evidence: ExperimentEvidence,
  todayDayId: string,
): ExperimentDaySegment {
  if (evidence.factorsByDay.get(dayId)?.[record.factorId] === HELD_STATE[record.intent]) {
    return 'held';
  }
  return dayId >= todayDayId ? 'pending' : 'missed';
}

function outcomeValues(
  dayIds: readonly string[],
  outcome: JournalOutcomeKey,
  lagDays: number,
  evidence: ExperimentEvidence,
): number[] {
  const series = evidence.outcomesByDay[outcome];
  return dayIds
    .map((dayId) => series.get(addTrainingDays(dayId, lagDays)))
    .filter((value): value is number => value !== undefined);
}

function compareWindowToBaseline(
  record: ExperimentRecord,
  heldDayIds: readonly string[],
  evidence: ExperimentEvidence,
): ExperimentEffect[] {
  const baseline = dayRange(
    addTrainingDays(record.startDayId, -EXPERIMENT_BASELINE_DAYS),
    EXPERIMENT_BASELINE_DAYS,
  );
  return OUTCOMES.flatMap((outcome) => {
    const lagDays = outcomeLagDays(record.factorId);
    const during = outcomeValues(heldDayIds, outcome, lagDays, evidence);
    const before = outcomeValues(baseline, outcome, lagDays, evidence);
    if (during.length === 0 || before.length === 0) {
      return [];
    }
    const delta = median(during) - median(before);
    const confidence = scoreObservationConfidence({
      nYes: during.length,
      nNo: before.length,
      absDelta: Math.abs(delta),
      outcome,
    });
    return [{ outcome, delta, nWindow: during.length, nBaseline: before.length, confidence }];
  });
}

/** Three states only: a gap under the association threshold is « sans effet ». */
export function experimentVerdict(
  effects: readonly ExperimentEffect[],
  heldDays: number,
  cancelled: boolean,
): ExperimentVerdict {
  if (cancelled || heldDays < EXPERIMENT_MIN_HELD_DAYS) {
    return 'abandoned';
  }
  const solid = effects.filter((effect) => effect.confidence !== 'none');
  const improved = solid.some((effect) => effect.delta > 0);
  const worsened = solid.some((effect) => effect.delta < 0);
  return improved && !worsened ? 'worked' : 'no_effect';
}

function windowDayIndex(startDayId: string, todayDayId: string): number {
  const elapsed = Math.round((Date.parse(todayDayId) - Date.parse(startDayId)) / DAY_MS) + 1;
  return Math.min(EXPERIMENT_WINDOW_DAYS, Math.max(1, elapsed));
}

export function evaluateExperiment(
  record: ExperimentRecord,
  evidence: ExperimentEvidence,
  todayDayId: string,
): EvaluatedExperiment {
  const windowDays = dayRange(record.startDayId, EXPERIMENT_WINDOW_DAYS);
  const segments = windowDays.map((dayId) => daySegment(dayId, record, evidence, todayDayId));
  const heldDayIds = windowDays.filter((_, index) => segments[index] === 'held');
  const reviewDayId = experimentReviewDayId(record);
  const cancelled = record.cancelledAt !== null;
  const reviewed = cancelled || todayDayId >= reviewDayId;
  const effects =
    reviewed && !cancelled ? compareWindowToBaseline(record, heldDayIds, evidence) : [];

  return {
    id: record.id,
    factorId: record.factorId,
    intent: record.intent,
    startDayId: record.startDayId,
    endDayId: windowDays[windowDays.length - 1]!,
    reviewDayId,
    status: reviewed ? 'reviewed' : 'running',
    dayIndex: windowDayIndex(record.startDayId, todayDayId),
    segments,
    heldDays: heldDayIds.length,
    verdict: reviewed ? experimentVerdict(effects, heldDayIds.length, cancelled) : null,
    effects,
  };
}
