import { format, parseISO, subDays } from 'date-fns';
import type { RecoveryViewModel } from '@sharpit/app/presentation/recovery-view-model';

/**
 * Tones the native client can render. The web view model only carries Tailwind classes,
 * so the projection reads the signal token each class names and never ships the class.
 */
export type V1RecoveryTone =
  'strong' | 'good' | 'moderate' | 'caution' | 'elevated' | 'risk' | 'neutral';

export type V1RecoveryDimensionKey = 'autonomic' | 'sleep' | 'subjective' | 'loadContext';

export type V1RecoverySource = Omit<
  RecoveryViewModel,
  'insights' | 'globalDecision' | 'hierarchy' | 'sections' | 'intensityClassName'
>;

export type V1RecoveryResponse = {
  apiVersion: 1;
  trainingDayId: string;
  empty: { title: string; message: string | null } | null;
  readinessScore: number | null;
  signal: { label: string; tone: V1RecoveryTone };
  isCalibrating: boolean;
  /** Athlete signal label (e.g. « VFC basse ») — keep for older clients. */
  limiter: string | null;
  /**
   * Stable machine code for the recovery frein chip.
   * Values: `hrv_low` | `rhr_high` | `sleep_short` | `sleep_poor` |
   * `subjective_low` | `load_elevated` | null.
   */
  limiterSignal:
    | 'hrv_low'
    | 'rhr_high'
    | 'sleep_short'
    | 'sleep_poor'
    | 'subjective_low'
    | 'load_elevated'
    | null;
  estimatedRecoveryDays: number | null;
  intensity: string;
  rationale: string[];
  dimensions: Array<{ key: V1RecoveryDimensionKey; score: number | null; status: string }>;
  pillars: Array<{ key: 'autonomic' | 'wellness' | 'load'; label: string; tone: V1RecoveryTone }>;
  dissonanceDetected: boolean;
  today: {
    hrv: number | null;
    restingHr: number | null;
    bodyBattery: number | null;
    hrvBaselineLow: number | null;
    hrvBaselineHigh: number | null;
  };
  /** Oldest first, one entry per day of the window ending on `trainingDayId`. */
  history: Array<{ date: string; hrv: number | null; restingHr: number | null }>;
  alerts: Array<{ key: 'overreaching' | 'illness'; label: string; tone: V1RecoveryTone }>;
  keyEvidence: string[];
  confidencePct: number | null;
  completenessLabel: string;
};

const TONE_BY_TOKEN: ReadonlyArray<[RegExp, V1RecoveryTone]> = [
  [/signal-risk/, 'risk'],
  [/signal-vo2/, 'elevated'],
  [/signal-caution/, 'caution'],
  [/signal-tempo/, 'moderate'],
  [/signal-recovery/, 'good'],
  [/\bprimary\b/, 'strong'],
];

export function toneFromClass(colorClass: string | null | undefined): V1RecoveryTone {
  if (!colorClass) {
    return 'neutral';
  }
  return TONE_BY_TOKEN.find(([pattern]) => pattern.test(colorClass))?.[1] ?? 'neutral';
}

const DIMENSION_ORDER: readonly V1RecoveryDimensionKey[] = [
  'autonomic',
  'sleep',
  'subjective',
  'loadContext',
];

function projectDimensions(dimensions: V1RecoverySource['dimensions']) {
  return DIMENSION_ORDER.flatMap((key) => {
    const dimension = dimensions?.[key];
    if (!dimension?.available) {
      return [];
    }
    return [{ key, score: dimension.score, status: dimension.status }];
  });
}

/** The web's three sparklines share one window; the client reads them as one series. */
function projectHistory(source: V1RecoverySource, trainingDayId: string) {
  const refDate = parseISO(trainingDayId);
  const length = Math.max(source.sparkHrv.length, source.sparkRhr.length);
  return Array.from({ length }, (_, index) => ({
    date: format(subDays(refDate, length - 1 - index), 'yyyy-MM-dd'),
    hrv: source.sparkHrv[index]?.value ?? null,
    restingHr: source.sparkRhr[index]?.value ?? null,
  }));
}

function projectAlerts(source: V1RecoverySource): V1RecoveryResponse['alerts'] {
  const alerts: V1RecoveryResponse['alerts'] = [];
  if (source.overreaching) {
    alerts.push({
      key: 'overreaching',
      label: source.overreaching.label,
      tone: toneFromClass(source.overreaching.colorClass),
    });
  }
  if (source.illness) {
    alerts.push({
      key: 'illness',
      label: source.illness.label,
      tone: toneFromClass(source.illness.colorClass),
    });
  }
  return alerts;
}

/** Canonical Recovery payload for native clients — a projection, no new domain logic. */
export function projectV1Recovery(
  source: V1RecoverySource,
  trainingDayId: string,
): V1RecoveryResponse {
  return {
    apiVersion: 1,
    trainingDayId,
    empty: source.emptyState
      ? { title: source.emptyState.title, message: source.emptyState.description ?? null }
      : null,
    readinessScore: source.readinessScore,
    signal: { label: source.signal.label, tone: toneFromClass(source.signal.qualityClass) },
    isCalibrating: source.isCalibrating,
    limiter: source.limiterLabel,
    limiterSignal: source.limiterSignal,
    estimatedRecoveryDays: source.estimatedRecoveryDays,
    intensity: source.intensityLabel,
    rationale: source.rationale,
    dimensions: projectDimensions(source.dimensions),
    pillars: [
      {
        key: 'autonomic',
        label: source.autonomicLabel,
        tone: toneFromClass(source.autonomicClass),
      },
      { key: 'wellness', label: source.wellnessLabel, tone: toneFromClass(source.wellnessClass) },
      { key: 'load', label: source.loadLabel, tone: toneFromClass(source.loadClass) },
    ],
    dissonanceDetected: source.dissonanceDetected,
    today: {
      hrv: source.hrv,
      restingHr: source.restingHr,
      bodyBattery: source.bodyBattery,
      hrvBaselineLow: source.baselineLow,
      hrvBaselineHigh: source.baselineHigh,
    },
    history: projectHistory(source, trainingDayId),
    alerts: projectAlerts(source),
    keyEvidence: source.keyEvidence,
    confidencePct: source.emptyState ? null : source.confidencePct,
    completenessLabel: source.completenessLabel,
  };
}
