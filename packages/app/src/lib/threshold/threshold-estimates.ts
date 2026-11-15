import type { AthleteProfile } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import {
  estimateFtp,
  estimateRunThresholdPace,
  fmtPaceSecPerKm,
} from '@sharpit/app/lib/training/periodization/performance-predictor';
import {
  estimateSwimCss,
  fmtCssSecPer100m,
  shouldSuggestSwimCss,
  type SwimCssSample,
} from '@sharpit/app/lib/threshold/swim-css';
import type {
  BikeEffort,
  PowerCurvePoint,
  RecordsPayload,
  RunBestCategory,
  RunEffort,
} from '@sharpit/app/lib/training/records/record-types';

/** Recent demonstrated capacity window for threshold suggestions (ADR-012). */
export const THRESHOLD_RECENCY_WINDOW_DAYS = 120;

/** FTP must move by at least this fraction of current to suggest a revision. */
export const FTP_MATERIALITY_PCT = 0.03;

/** Absolute floor on FTP materiality (watts). */
export const FTP_MATERIALITY_ABS_W = 5;

/** Pace must move by at least this many s/km to suggest a revision. */
export const PACE_MATERIALITY_SEC_PER_KM = 5;

export interface ThresholdEstimates {
  ftpW: number | null;
  ftpSource: string | null;
  runThresholdPaceSecPerKm: number | null;
  /** Critical swim speed (s/100 m), median of qualifying pool sessions. */
  swimCssSecPer100m: number | null;
  /** Days of history the estimate was allowed to see. */
  windowDays: number;
}

export type ThresholdChangeDirection = 'up' | 'down' | 'set';

/** A reference the estimator can revise, and the athlete can accept one by one. */
export type ThresholdField = 'ftpW' | 'runThresholdPaceSecPerKm' | 'swimCssSecPer100m';

export interface ThresholdChange {
  field: ThresholdField;
  label: string;
  from: string;
  to: string;
  direction: ThresholdChangeDirection;
}

/**
 * Which revisions to actually write.
 *
 * `requested` omitted means the athlete took everything on offer. Anything
 * requested that the preview does not propose is dropped: a stale page or a
 * hand-made request must never write a value nobody was shown.
 */
export function resolveAcceptedFields(
  proposed: ThresholdField[],
  requested?: ThresholdField[],
): ThresholdField[] {
  const offered = new Set(proposed);
  if (!requested) {
    return [...offered];
  }
  return [...new Set(requested.filter((field) => offered.has(field)))];
}

export interface ThresholdApplyPreview {
  estimates: ThresholdEstimates;
  current: {
    ftpW: number | null;
    runThresholdPaceSecPerKm: number | null;
    swimCssSecPer100m: number | null;
  };
  changes: ThresholdChange[];
  hasChanges: boolean;
}

function ageDays(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function withinWindow(iso: string | undefined, now: Date, windowDays: number): boolean {
  if (!iso) {
    return false;
  }
  const age = ageDays(iso, now);
  return age >= 0 && age <= windowDays;
}

/** Keep only efforts / curve points / bests inside the recency window. Undated efforts drop out. */
export function filterRecordsForThresholdWindow(
  records: RecordsPayload,
  windowDays: number = THRESHOLD_RECENCY_WINDOW_DAYS,
  now: Date = new Date(),
): Pick<RecordsPayload, 'powerCurve' | 'runBests' | 'runEfforts' | 'bikeEfforts'> {
  const powerCurve: PowerCurvePoint[] = records.powerCurve.filter((p) =>
    withinWindow(p.date, now, windowDays),
  );

  const runBests: RunBestCategory[] = records.runBests
    .map((cat) => ({
      ...cat,
      entries: cat.entries.filter((e) => withinWindow(e.date, now, windowDays)),
    }))
    .filter((cat) => cat.entries.length > 0);

  const runEfforts: RunEffort[] = records.runEfforts.filter((e) =>
    withinWindow(e.date, now, windowDays),
  );
  const bikeEfforts: BikeEffort[] = records.bikeEfforts.filter((e) =>
    withinWindow(e.date, now, windowDays),
  );

  return { powerCurve, runBests, runEfforts, bikeEfforts };
}

function resolveThresholdOptions(options?: {
  windowDays?: number;
  now?: Date;
  swimSamples?: SwimCssSample[];
}) {
  return {
    windowDays: options?.windowDays ?? THRESHOLD_RECENCY_WINDOW_DAYS,
    now: options?.now ?? new Date(),
    swimSamples: options?.swimSamples ?? [],
  };
}

function ftpFieldsFromEstimate(ftp: ReturnType<typeof estimateFtp>) {
  return {
    ftpW: ftp?.watts ?? null,
    ftpSource: ftp?.source ?? null,
  };
}

export function computeThresholdEstimates(
  records: RecordsPayload,
  options?: { windowDays?: number; now?: Date; swimSamples?: SwimCssSample[] },
): ThresholdEstimates {
  const { windowDays, now, swimSamples } = resolveThresholdOptions(options);
  const windowed = filterRecordsForThresholdWindow(records, windowDays, now);
  const ftp = estimateFtp(windowed.powerCurve, windowed.bikeEfforts);
  const pace = estimateRunThresholdPace(windowed.runBests, windowed.runEfforts);
  const css = estimateSwimCss(swimSamples, { windowDays, now });
  return {
    ...ftpFieldsFromEstimate(ftp),
    runThresholdPaceSecPerKm: pace,
    swimCssSecPer100m: css,
    windowDays,
  };
}

function fmtFtp(w: number | null): string {
  return isSet(w) ? `${w} W` : '—';
}

/** True when |estimated − current| clears both the relative and absolute FTP gates. */
export function isMaterialFtpChange(current: number, estimated: number): boolean {
  const delta = Math.abs(estimated - current);
  const minDelta = Math.max(FTP_MATERIALITY_ABS_W, current * FTP_MATERIALITY_PCT);
  return delta >= minDelta;
}

/** True when pace differs by at least PACE_MATERIALITY_SEC_PER_KM (either direction). */
export function isMaterialPaceChange(current: number, estimated: number): boolean {
  return Math.abs(estimated - current) >= PACE_MATERIALITY_SEC_PER_KM;
}

function shouldSuggestFtp(current: number | null, estimated: number | null): boolean {
  if (estimated === undefined || estimated === null) {
    return false;
  }
  if (current === undefined || current === null) {
    return true;
  }
  return isMaterialFtpChange(current, estimated);
}

function shouldSuggestThresholdPace(current: number | null, estimated: number | null): boolean {
  if (estimated === undefined || estimated === null) {
    return false;
  }
  if (current === undefined || current === null) {
    return true;
  }
  return isMaterialPaceChange(current, estimated);
}

function ftpDirection(current: number | null, estimated: number): ThresholdChangeDirection {
  if (current === undefined || current === null) {
    return 'set';
  }
  return estimated > current ? 'up' : 'down';
}

function paceDirection(current: number | null, estimated: number): ThresholdChangeDirection {
  if (current === undefined || current === null) {
    return 'set';
  }
  // Lower s/km = faster = "up" in performance terms
  return estimated < current ? 'up' : 'down';
}

function buildFtpChange(current: number | null, estimated: number | null): ThresholdChange | null {
  if (!shouldSuggestFtp(current, estimated) || estimated === undefined || estimated === null) {
    return null;
  }
  return {
    field: 'ftpW',
    label: 'FTP vélo',
    from: fmtFtp(current),
    to: fmtFtp(estimated),
    direction: ftpDirection(current, estimated),
  };
}

function buildPaceChange(current: number | null, estimated: number | null): ThresholdChange | null {
  if (
    !shouldSuggestThresholdPace(current, estimated) ||
    estimated === undefined ||
    estimated === null
  ) {
    return null;
  }
  return {
    field: 'runThresholdPaceSecPerKm',
    label: 'Allure seuil',
    from: current ? fmtPaceSecPerKm(current) : '—',
    to: fmtPaceSecPerKm(estimated),
    direction: paceDirection(current, estimated),
  };
}

function buildSwimCssChange(
  current: number | null,
  estimated: number | null,
): ThresholdChange | null {
  if (!shouldSuggestSwimCss(current, estimated) || estimated === undefined || estimated === null) {
    return null;
  }
  return {
    field: 'swimCssSecPer100m',
    label: 'Vitesse critique natation',
    from: current ? fmtCssSecPer100m(current) : '—',
    to: fmtCssSecPer100m(estimated),
    direction: paceDirection(current, estimated),
  };
}

function buildThresholdChanges(
  current: ThresholdApplyPreview['current'],
  estimates: ThresholdEstimates,
): ThresholdChange[] {
  return [
    buildFtpChange(current.ftpW, estimates.ftpW),
    buildPaceChange(current.runThresholdPaceSecPerKm, estimates.runThresholdPaceSecPerKm),
    buildSwimCssChange(current.swimCssSecPer100m, estimates.swimCssSecPer100m),
  ].filter((change): change is ThresholdChange => isSet(change));
}

/** Compare windowed estimates to the athlete's current thresholds. */
/** The most one revision may lower a threshold: 5 % of power, 3 % of pace. */
export const MAX_FTP_DROP_RATIO = 0.95;
export const MAX_PACE_SLOWDOWN_RATIO = 1.03;

/**
 * An estimate drawn from the best efforts of a window is a floor, not a measure: weeks
 * without an all-out effort lower it while the athlete loses nothing. Followed as it came,
 * an FTP went from 207 to 170 W in three months and every session was rescored on it. A
 * revision upward is taken whole; one downward moves by a bounded step.
 */
function boundDownwardRevisions(
  estimates: ThresholdEstimates,
  current: ThresholdApplyPreview['current'],
): ThresholdEstimates {
  const slowest = (now: number | null, estimated: number | null) =>
    isSet(now) && isSet(estimated)
      ? Math.min(estimated, Math.round(now * MAX_PACE_SLOWDOWN_RATIO))
      : estimated;
  return {
    ...estimates,
    ftpW:
      isSet(current.ftpW) && isSet(estimates.ftpW)
        ? Math.max(estimates.ftpW, Math.floor(current.ftpW * MAX_FTP_DROP_RATIO))
        : estimates.ftpW,
    runThresholdPaceSecPerKm: slowest(
      current.runThresholdPaceSecPerKm,
      estimates.runThresholdPaceSecPerKm,
    ),
    swimCssSecPer100m: slowest(current.swimCssSecPer100m, estimates.swimCssSecPer100m),
  };
}

export function previewThresholdApply(
  records: RecordsPayload,
  profile: Pick<AthleteProfile, 'ftpW' | 'runThresholdPaceSecPerKm' | 'swimCssSecPer100m'> | null,
  options?: { windowDays?: number; now?: Date; swimSamples?: SwimCssSample[] },
): ThresholdApplyPreview {
  const current = {
    ftpW: profile?.ftpW ?? null,
    runThresholdPaceSecPerKm: profile?.runThresholdPaceSecPerKm ?? null,
    swimCssSecPer100m: profile?.swimCssSecPer100m ?? null,
  };
  const estimates = boundDownwardRevisions(computeThresholdEstimates(records, options), current);
  const changes = buildThresholdChanges(current, estimates);
  return { estimates, current, changes, hasChanges: changes.length > 0 };
}
