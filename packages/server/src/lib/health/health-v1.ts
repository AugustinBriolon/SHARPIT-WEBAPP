import type { BiologicalAge } from '@sharpit/server/lib/body/biological-age';
import { ageInYears, isReferenceSex } from '@sharpit/server/lib/body/biological-age';
import {
  bodyFatNorm,
  hrvNorm,
  respirationNorm,
  restingHrNorm,
  sleepNorm,
  stepsNorm,
  visceralFatNorm,
  vo2maxNorm,
  type HealthNorm,
} from '@sharpit/server/lib/health/health-norms';
import {
  healthTrend,
  mean,
  type HealthPoint,
  type HealthTrend,
  type TrendRule,
} from '@sharpit/server/lib/health/health-trend';

/**
 * Santé for the native app: the athlete's health as a check-up rather than a list of readings.
 *
 * Each marker is read twice — against a published norm and against the athlete's own last
 * month — and comes with its last 30 days. Markers are grouped by how much they say about
 * health: the vital signs first, then body composition, then the daily context. `watch` holds
 * only what deserves attention now; it is empty on a quiet month, never filled for its own sake.
 */

export const HEALTH_MARKER_KEYS = [
  'restingHr',
  'hrv',
  'sleep',
  'vo2max',
  'weight',
  'bodyFatPct',
  'visceralFat',
  'musclePct',
  'steps',
  'respiration',
] as const;

export type HealthMarkerKey = (typeof HEALTH_MARKER_KEYS)[number];

// ---- Inputs -------------------------------------------------------------------------

export type HealthDailyRow = {
  date: Date;
  restingHr: number | null;
  hrv: number | null;
  hrvBaselineLow: number | null;
  hrvBaselineHigh: number | null;
  sleepMinutes: number | null;
  totalSteps: number | null;
  sleepRespiration: number | null;
  weightKg: number | null;
};

export type HealthCompositionRow = {
  measuredAt: Date;
  weightKg: number | null;
  bodyFatPct: number | null;
  visceralFat: number | null;
  musclePct: number | null;
};

export type HealthInputs = {
  daily: HealthDailyRow[];
  composition: HealthCompositionRow[];
  profile: {
    birthDate: Date | null;
    sex: string | null;
    vo2max: number | null;
    vo2maxMeasuredAt: Date | null;
    targetWeightKg: number | null;
  } | null;
  biologicalAge: BiologicalAge | null;
  biologicalAgeAccess: 'granted' | 'pro_required';
};

// ---- Outputs ------------------------------------------------------------------------

export type V1HealthMarker = {
  key: HealthMarkerKey;
  value: number;
  unit: string;
  /** `average7`: the mean of the last 7 days; `latest`: the last reading. */
  basis: 'average7' | 'latest';
  measuredAt: string;
  norm: HealthNorm | null;
  trend: HealthTrend | null;
  series: Array<{ date: string; value: number }>;
  target?: number;
};

export type V1HealthWatch = {
  key: HealthMarkerKey;
  title: string;
  detail: string;
};

export type V1HealthOverview = {
  apiVersion: 1;
  synthesis: {
    biologicalAge: BiologicalAge | null;
    biologicalAgeAccess: 'granted' | 'pro_required';
    /** Markers read against a norm, and how many of them are not flagged. */
    normed: number;
    inNorm: number;
    /** Up to three markers whose month moved, the ones to watch first. */
    highlights: Array<{ key: HealthMarkerKey; delta: number; tone: 'good' | 'watch' }>;
  };
  watch: V1HealthWatch[];
  vitals: V1HealthMarker[];
  body: V1HealthMarker[];
  daily: V1HealthMarker[];
};

// ---- Reading ------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 30;

const UNITS: Record<HealthMarkerKey, string> = {
  restingHr: 'bpm',
  hrv: 'ms',
  sleep: 'min',
  vo2max: 'ml/kg/min',
  weight: 'kg',
  bodyFatPct: '%',
  visceralFat: 'index',
  musclePct: '%',
  steps: 'steps',
  respiration: 'rpm',
};

const TREND_RULES: Record<HealthMarkerKey, TrendRule> = {
  restingHr: { favorable: 'down', noise: 2 },
  hrv: { favorable: 'up', noise: 3 },
  sleep: { favorable: 'up', noise: 20 },
  vo2max: { favorable: 'up', noise: 1, recentDays: 30 },
  weight: { favorable: 'none', noise: 0.5, recentDays: 14 },
  bodyFatPct: { favorable: 'down', noise: 0.5, recentDays: 14 },
  visceralFat: { favorable: 'down', noise: 1, recentDays: 14 },
  musclePct: { favorable: 'up', noise: 0.5, recentDays: 14 },
  steps: { favorable: 'up', noise: 1_000 },
  respiration: { favorable: 'none', noise: 0.5 },
};

type DailyField = 'restingHr' | 'hrv' | 'sleepMinutes' | 'totalSteps' | 'sleepRespiration';

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dailyPoints(rows: HealthDailyRow[], field: DailyField): HealthPoint[] {
  return rows
    .filter((row) => row[field] !== null)
    .map((row) => ({ date: row.date, value: row[field]! }));
}

function compositionPoints(
  rows: HealthCompositionRow[],
  field: 'weightKg' | 'bodyFatPct' | 'visceralFat' | 'musclePct',
): HealthPoint[] {
  return rows
    .filter((row) => row[field] !== null)
    .map((row) => ({ date: row.measuredAt, value: row[field]! }));
}

function oldestFirst(points: HealthPoint[]): HealthPoint[] {
  return [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function lastDays(points: HealthPoint[], now: Date, days: number): HealthPoint[] {
  const from = now.getTime() - days * DAY_MS;
  return points.filter((point) => point.date.getTime() > from);
}

type MarkerReading = {
  points: HealthPoint[];
  basis: V1HealthMarker['basis'];
  norm: (value: number) => HealthNorm | null;
  target?: number | null;
};

function marker(key: HealthMarkerKey, reading: MarkerReading, now: Date): V1HealthMarker | null {
  const points = oldestFirst(reading.points);
  const latest = points.at(-1);
  if (!latest) {
    return null;
  }
  const recent = mean(lastDays(points, now, 7).map((point) => point.value));
  const value = reading.basis === 'average7' ? recent : latest.value;
  if (value === null) {
    return null;
  }
  const trend = healthTrend(points, now, TREND_RULES[key]);
  return {
    key,
    value: round(value),
    unit: UNITS[key],
    basis: reading.basis,
    measuredAt: latest.date.toISOString(),
    norm: reading.norm(value),
    trend: trend && {
      ...trend,
      recent: round(trend.recent),
      baseline: round(trend.baseline),
      delta: round(trend.delta),
    },
    series: lastDays(points, now, SERIES_DAYS).map((point) => ({
      date: dayString(point.date),
      value: round(point.value),
    })),
    ...(reading.target ? { target: reading.target } : {}),
  };
}

/** Garmin's own HRV range when it sends one, else the athlete's two months, ±1 SD. */
export function hrvRange(rows: HealthDailyRow[], now: Date): { low: number; high: number } | null {
  const newest = [...rows].sort((a, b) => b.date.getTime() - a.date.getTime());
  const garmin = newest.find((row) => row.hrvBaselineLow !== null && row.hrvBaselineHigh !== null);
  if (garmin) {
    return { low: garmin.hrvBaselineLow!, high: garmin.hrvBaselineHigh! };
  }
  const split = now.getTime() - 7 * DAY_MS;
  const values = rows
    .filter((row) => row.hrv !== null && row.date.getTime() <= split)
    .filter((row) => row.date.getTime() > split - 60 * DAY_MS)
    .map((row) => row.hrv!);
  const average = mean(values);
  if (average === null || values.length < 14) {
    return null;
  }
  const sd = Math.sqrt(mean(values.map((value) => (value - average) ** 2))!);
  return { low: Math.round(average - sd), high: Math.round(average + sd) };
}

type Demographics = { age: number | null; sex: 'female' | 'male' | null };

function demographicsOf(inputs: HealthInputs, now: Date): Demographics {
  const { profile } = inputs;
  return {
    age: profile?.birthDate ? ageInYears(profile.birthDate, now) : null,
    sex: profile && isReferenceSex(profile.sex) ? profile.sex : null,
  };
}

function vitals(inputs: HealthInputs, people: Demographics, now: Date): V1HealthMarker[] {
  const range = hrvRange(inputs.daily, now);
  const { profile } = inputs;
  const vo2Points =
    profile?.vo2max && profile.vo2maxMeasuredAt
      ? [{ date: profile.vo2maxMeasuredAt, value: profile.vo2max }]
      : [];
  return [
    marker(
      'restingHr',
      { points: dailyPoints(inputs.daily, 'restingHr'), basis: 'average7', norm: restingHrNorm },
      now,
    ),
    marker(
      'hrv',
      {
        points: dailyPoints(inputs.daily, 'hrv'),
        basis: 'average7',
        norm: (v) => (range ? hrvNorm(v, range) : null),
      },
      now,
    ),
    marker(
      'sleep',
      { points: dailyPoints(inputs.daily, 'sleepMinutes'), basis: 'average7', norm: sleepNorm },
      now,
    ),
    marker(
      'vo2max',
      {
        points: vo2Points,
        basis: 'latest',
        norm: (v) =>
          people.age !== null && people.sex ? vo2maxNorm(v, people.age, people.sex) : null,
      },
      now,
    ),
  ].filter((entry): entry is V1HealthMarker => entry !== null);
}

function weightPoints(inputs: HealthInputs): HealthPoint[] {
  const scale = compositionPoints(inputs.composition, 'weightKg');
  if (scale.length > 0) {
    return scale;
  }
  return inputs.daily
    .filter((row) => row.weightKg !== null)
    .map((row) => ({ date: row.date, value: row.weightKg! }));
}

function body(inputs: HealthInputs, people: Demographics, now: Date): V1HealthMarker[] {
  const none = () => null;
  return [
    marker(
      'weight',
      {
        points: weightPoints(inputs),
        basis: 'latest',
        norm: none,
        target: inputs.profile?.targetWeightKg,
      },
      now,
    ),
    marker(
      'bodyFatPct',
      {
        points: compositionPoints(inputs.composition, 'bodyFatPct'),
        basis: 'latest',
        norm: (v) => (people.sex ? bodyFatNorm(v, people.sex) : null),
      },
      now,
    ),
    marker(
      'visceralFat',
      {
        points: compositionPoints(inputs.composition, 'visceralFat'),
        basis: 'latest',
        norm: visceralFatNorm,
      },
      now,
    ),
    marker(
      'musclePct',
      { points: compositionPoints(inputs.composition, 'musclePct'), basis: 'latest', norm: none },
      now,
    ),
  ].filter((entry): entry is V1HealthMarker => entry !== null);
}

function daily(inputs: HealthInputs, people: Demographics, now: Date): V1HealthMarker[] {
  return [
    marker(
      'steps',
      {
        points: dailyPoints(inputs.daily, 'totalSteps'),
        basis: 'average7',
        norm: (v) => stepsNorm(v, people.age),
      },
      now,
    ),
    marker(
      'respiration',
      {
        points: dailyPoints(inputs.daily, 'sleepRespiration'),
        basis: 'average7',
        norm: respirationNorm,
      },
      now,
    ),
  ].filter((entry): entry is V1HealthMarker => entry !== null);
}

// ---- What to watch ------------------------------------------------------------------

function formatHoursMinutes(minutes: number): string {
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}

/** Days in a row, from the newest, with a resting HR at least 5 bpm over the month before. */
function restingHrWatch(rows: HealthDailyRow[], now: Date): V1HealthWatch | null {
  const points = oldestFirst(dailyPoints(rows, 'restingHr'));
  const split = now.getTime() - 7 * DAY_MS;
  const baseline = mean(
    points
      .filter(
        (point) => point.date.getTime() <= split && point.date.getTime() > split - 30 * DAY_MS,
      )
      .map((point) => point.value),
  );
  if (baseline === null) {
    return null;
  }
  let days = 0;
  for (const point of [...lastDays(points, now, 7)].reverse()) {
    if (point.value < baseline + 5) {
      break;
    }
    days += 1;
  }
  if (days < 3) {
    return null;
  }
  const recent = mean(points.slice(-days).map((point) => point.value))!;
  return {
    key: 'restingHr',
    title: 'Fréquence cardiaque au repos en hausse',
    detail: `+${Math.round(recent - baseline)} bpm au-dessus de ta moyenne depuis ${days} jours. Fatigue, stress, maladie qui couve ou chaleur la font monter.`,
  };
}

function markerWatch(entry: V1HealthMarker): V1HealthWatch | null {
  if (entry.key === 'hrv' && entry.norm?.band === 'below') {
    return {
      key: 'hrv',
      title: 'VFC sous ta plage habituelle',
      detail: `Moyenne de 7 jours : ${Math.round(entry.value)} ms. Ton corps récupère moins bien que d’habitude.`,
    };
  }
  if (entry.key === 'sleep' && entry.value < 390) {
    return {
      key: 'sleep',
      title: 'Nuits courtes',
      detail: `Moyenne de 7 jours : ${formatHoursMinutes(entry.value)}, sous les 7 h recommandées.`,
    };
  }
  return null;
}

function weightWatch(points: HealthPoint[], now: Date): V1HealthWatch | null {
  const ordered = oldestFirst(points);
  const latest = ordered.at(-1);
  const twoWeeksAgo = ordered
    .filter((point) => point.date.getTime() <= now.getTime() - 14 * DAY_MS)
    .at(-1);
  if (!latest || !twoWeeksAgo || latest.date.getTime() < now.getTime() - 7 * DAY_MS) {
    return null;
  }
  const change = latest.value - twoWeeksAgo.value;
  if (Math.abs(change) / twoWeeksAgo.value < 0.02) {
    return null;
  }
  const signed = `${change > 0 ? '+' : '−'}${Math.abs(round(change)).toString().replace('.', ',')}`;
  return {
    key: 'weight',
    title: 'Poids qui bouge vite',
    detail: `${signed} kg en deux semaines. Au-delà de 2 %, c’est souvent l’eau, l’appétit ou l’énergie qui manque.`,
  };
}

function watchList(inputs: HealthInputs, markers: V1HealthMarker[], now: Date): V1HealthWatch[] {
  return [
    restingHrWatch(inputs.daily, now),
    ...markers.map(markerWatch),
    weightWatch(weightPoints(inputs), now),
  ].filter((entry): entry is V1HealthWatch => entry !== null);
}

// ---- Synthesis ----------------------------------------------------------------------

function highlights(markers: V1HealthMarker[]): V1HealthOverview['synthesis']['highlights'] {
  const moved = markers.filter(
    (entry): entry is V1HealthMarker & { trend: HealthTrend & { tone: 'good' | 'watch' } } =>
      entry.trend !== null && entry.trend.tone !== 'neutral',
  );
  // Order kept within each tone: the vital signs come first, as on the page.
  return [
    ...moved.filter((e) => e.trend.tone === 'watch'),
    ...moved.filter((e) => e.trend.tone === 'good'),
  ]
    .slice(0, 3)
    .map((entry) => ({ key: entry.key, delta: entry.trend.delta, tone: entry.trend.tone }));
}

export function projectV1HealthOverview(inputs: HealthInputs, now = new Date()): V1HealthOverview {
  const people = demographicsOf(inputs, now);
  const vitalMarkers = vitals(inputs, people, now);
  const bodyMarkers = body(inputs, people, now);
  const dailyMarkers = daily(inputs, people, now);
  const all = [...vitalMarkers, ...bodyMarkers, ...dailyMarkers];
  const normed = all.filter((entry) => entry.norm !== null);
  return {
    apiVersion: 1,
    synthesis: {
      biologicalAge: inputs.biologicalAge,
      biologicalAgeAccess: inputs.biologicalAgeAccess,
      normed: normed.length,
      inNorm: normed.filter((entry) => entry.norm!.tone !== 'watch').length,
      highlights: highlights(all),
    },
    watch: watchList(inputs, all, now),
    vitals: vitalMarkers,
    body: bodyMarkers,
    daily: dailyMarkers,
  };
}
