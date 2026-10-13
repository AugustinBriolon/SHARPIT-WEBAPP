import {
  isMultisportLegArray,
  legDisplayDurationSec,
  type MultisportLeg,
} from '@sharpit/app/lib/activity/multisport';
import { parseChronoInput } from '@sharpit/app/lib/goals/goal-metric-config';
import { isRaceDayReached, raceDayKey } from '@sharpit/app/lib/goals/race-moment';
import { median } from '@sharpit/app/lib/journal/journal-habit-analysis';
import {
  appliedWeeklyRate,
  legTrend,
  raceDayFactor,
  regularityScore,
  type RegularityInputs,
} from '@sharpit/app/lib/goals/goal-race-progression';
import { RIEGEL_EXPONENT } from '@sharpit/app/lib/training/periodization/performance-predictor';
import {
  estimateBikeSpeedMsFromPower,
  resolveTriathlonFormat,
  triathlonDistances,
  type FormatSpec,
} from '@sharpit/app/lib/training/periodization/triathlon-performance-predictor';

const RUN_RACE_TARGETS: readonly { meters: number; patterns: readonly RegExp[] }[] = [
  {
    meters: 5000,
    patterns: [/\b5\s*k(?:m)?\b/i, /\b5000\s*m\b/i],
  },
  {
    meters: 10000,
    patterns: [/\b10\s*k(?:m)?\b/i, /\b10000\s*m\b/i],
  },
  {
    meters: 21097,
    patterns: [
      /\bsemi[- ]?marathon\b/i,
      /\bsemi\b/i,
      /\bhalf[- ]?marathon\b/i,
      /\b21(?:[.,]1)?\s*k(?:m)?\b/i,
    ],
  },
  {
    meters: 42195,
    patterns: [/\bmarathon\b/i, /\b42(?:[.,]2)?\s*k(?:m)?\b/i],
  },
];

const MULTISPORT_BLOCK =
  /\b(?:half\s*)?iron(?:man)?\b|\btriathlon\b|\bolympique\b|\bolympic\b|\b70\.3\b|\bim\b/i;

/** Resolve a supported run race distance from format / title, or null. */
export function resolveRunRaceMeters(
  raceFormat: string | null,
  title: string | null,
): number | null {
  const haystack = [raceFormat, title].filter(Boolean).join(' · ');
  if (!haystack.trim()) {
    return null;
  }
  if (MULTISPORT_BLOCK.test(haystack)) {
    return null;
  }

  for (const target of RUN_RACE_TARGETS) {
    if (target.patterns.some((pattern) => pattern.test(haystack))) {
      return target.meters;
    }
  }
  return null;
}

/** Parse "1h30", "6h", "5h00", "5h28'30" style durations after Sub/Sous stripping. */
function parseHourMinuteTarget(stripped: string): number | null {
  const hourMin = stripped.match(
    /^(\d+)\s*h\s*(\d{1,2})?\s*(?:['’]|m(?:in)?)?\s*(\d{1,2})?\s*(?:["”]|s)?$/i,
  );
  if (!hourMin) {
    return null;
  }
  const hours = Number(hourMin[1]);
  const minutes = hourMin[2] !== undefined ? Number(hourMin[2]) : 0;
  const seconds = hourMin[3] !== undefined ? Number(hourMin[3]) : 0;
  if (minutes >= 60 || seconds >= 60 || (hourMin[3] !== undefined && hourMin[2] === undefined)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/** Parse "50 min", "50min" — minutes alone. */
function parseMinuteTarget(stripped: string): number | null {
  const minutes = stripped.match(/^(\d+)\s*min(?:utes?)?$/i);
  return minutes ? Number(minutes[1]) * 60 : null;
}

/**
 * Parse free-text race targets: "1:30:00", "Sub 1h30", "Sous 6h", "Sub 5h00".
 */
export function parseRaceTargetSeconds(raw: string | null | undefined): number | null {
  if (!raw?.trim()) {
    return null;
  }
  const trimmed = raw.trim();
  const direct = parseChronoInput(trimmed);
  if (direct !== null) {
    return direct;
  }

  const stripped = trimmed.replace(/^(sub|sous|<)\s*/i, '').trim();
  return (
    parseChronoInput(stripped) ?? parseHourMinuteTarget(stripped) ?? parseMinuteTarget(stripped)
  );
}

/*
 * Race finish projection (v2) — the one model behind the goal payloads, read as-is by iOS.
 *
 * Per leg, the most specific evidence wins: the athlete's past races ('history'), then the last
 * 12 weeks of training ('recent'), then the profile thresholds ('profile'), then amateur
 * defaults ('default'). Calibrated from past linked races: T1/T2 (their median) and the swim
 * pace per 100 m (a factor against today's CSS would reduce to that same pace). Backtested on
 * the Versailles Half (5:40:02): v2 lands within 10 min where the old iOS model said 6:05.
 */

export type RaceProjectionLegKind = 'swim' | 't1' | 'bike' | 't2' | 'run';
export type RaceProjectionSource = 'history' | 'recent' | 'profile' | 'default';
export type RaceProjectionConfidence = 'low' | 'medium' | 'high';

export type RaceProjectionLeg = {
  kind: RaceProjectionLegKind;
  sec: number;
  source: RaceProjectionSource;
};

export type RaceProjectionHistoryPoint = { weekKey: string; date: string; finishSec: number };

export type RaceProjection = {
  /** Projected at race day: today's level carried forward by the trend (goal-race-progression). */
  finishSec: number;
  /** Today's level, if the race were now. */
  todaySec: number;
  /** 0..1 over the last 8 weeks (plan adherence, steadiness of weekly volume); null with no data. */
  regularity: number | null;
  /** Finish time change per week the projection applies; null without a measurable trend. */
  trend: { secPerWeek: number | null };
  /** One race-day projection per ISO week, oldest first (filled by the server). */
  history: RaceProjectionHistoryPoint[];
  lowSec: number;
  highSec: number;
  targetSec: number | null;
  /** finish − target: negative when the projection beats the target. */
  deltaSec: number | null;
  legs: RaceProjectionLeg[];
  confidence: RaceProjectionConfidence;
  /** French hints on what would sharpen the projection. */
  missing: string[];
  /** ISO time it was frozen, when this is the pre-race projection. */
  frozenAt: string | null;
};

export type RaceProjectionInputs = RegularityInputs & {
  /** Only evidence strictly before this instant counts — now, or race day for a past race. */
  asOf: Date;
  profile: {
    swimCssSecPer100m: number | null;
    runThresholdPaceSecPerKm: number | null;
    ftpW: number | null;
    weightKg: number | null;
  };
  /** Run references: whole runs and stream bests per distance, each dated. */
  runEfforts: readonly { meters: number; seconds: number; date: Date | string }[];
  rides: readonly { date: Date | string; distanceM: number; durationSec: number }[];
  /** Activities linked to race goals; only multisport ones calibrate. */
  pastRaces: readonly { date: Date | string; multisportLegs: unknown }[];
};

type RaceGoalFields = {
  targetDate?: Date | string | null;
  raceFormat: string | null;
  title: string | null;
  targetPerformance: string | null;
};

type TrendPoint = { date: Date | string; sec: number };
type LegEstimate = {
  sec: number;
  source: RaceProjectionSource;
  missing?: string;
  /** Leg-equivalent times over the recent window, for the race-day trend. */
  trendPoints?: TrendPoint[];
};

const DAY_MS = 86_400_000;
const RECENT_WINDOW_DAYS = 84;
/** Fewer recent long rides than this and the window widens to all rides, then to FTP. */
const MIN_RIDES = 3;
/** Long ride = at least this share of the race bike distance. */
const LONG_RIDE_SHARE = 0.35;
/** Wetsuit open water: slightly faster than pool CSS for most age-groupers. */
const OPEN_WATER_FACTOR = 0.98;
/** Threshold pace ≈ a 1 h effort ≈ 15 km for an amateur (as estimateRunThresholdPace). */
const THRESHOLD_PROXY_METERS = 15_000;
/** Shortest reference Riegel may extrapolate from: short bests over-promise long races. */
const MIN_RUN_REF_METERS = 3000;
const MIN_RUN_REF_SHARE = 0.2;
const MAX_RUN_REF_MULTIPLE = 3;
/** Faster than 2:30/km is a mislabelled activity, not a run. */
const FASTEST_RUN_PACE_SEC_PER_KM = 150;
const MIN_TRANSITION_SEC = 30;
const MAX_TRANSITION_SEC = 20 * 60;
/** Amateur fallbacks when the athlete gave nothing at all. */
const DEFAULT_CSS_SEC_PER_100M = 115;
const DEFAULT_RUN_THRESHOLD_SEC_PER_KM = 330;
const DEFAULT_BIKE_SPEED_MS = 28 / 3.6;
const DEFAULT_WEIGHT_KG = 75;
/** Half-width of the finish range by confidence: shrinks as measured legs replace guesses. */
/** The range widens by up to half again as regularity drops to 0. */
const IRREGULARITY_SPREAD = 0.5;
const SPREAD_BY_CONFIDENCE: Record<RaceProjectionConfidence, number> = {
  low: 0.06,
  medium: 0.045,
  high: 0.03,
};

const MISSING = {
  runProfile: 'Pas de course à pied récente : allure seuil du profil utilisée',
  runDefault: 'Pas de course à pied récente ni d’allure seuil : renseigne ton allure seuil',
  swimDefault: 'Renseigne ta CSS',
  bikeFtp: 'Moins de 3 sorties vélo longues : vitesse estimée depuis ta FTP',
  bikeDefault: 'Renseigne ta FTP ou fais des sorties vélo longues',
} as const;

function timeMs(date: Date | string): number {
  return new Date(date).getTime();
}

function isBefore(date: Date | string, asOf: Date): boolean {
  return timeMs(date) < asOf.getTime();
}

function isRecent(date: Date | string, asOf: Date): boolean {
  return isBefore(date, asOf) && timeMs(date) >= asOf.getTime() - RECENT_WINDOW_DAYS * DAY_MS;
}

function medianOrNull(values: readonly number[]): number | null {
  return values.length > 0 ? median(values) : null;
}

function riegelSeconds(seconds: number, fromMeters: number, toMeters: number): number {
  return seconds * (toMeters / fromMeters) ** RIEGEL_EXPONENT;
}

/** Riegel'd standalone times over `meters` from the last 12 weeks' references around it. */
function recentRunPredictions(
  meters: number,
  efforts: RaceProjectionInputs['runEfforts'],
  asOf: Date,
): TrendPoint[] {
  const minMeters = Math.max(MIN_RUN_REF_METERS, MIN_RUN_REF_SHARE * meters);
  return efforts
    .filter(
      (effort) =>
        isRecent(effort.date, asOf) &&
        effort.meters >= minMeters &&
        effort.meters <= MAX_RUN_REF_MULTIPLE * meters &&
        (effort.seconds / effort.meters) * 1000 >= FASTEST_RUN_PACE_SEC_PER_KM,
    )
    .map((effort) => ({
      date: effort.date,
      sec: riegelSeconds(effort.seconds, effort.meters, meters),
    }));
}

/**
 * Standalone time over `meters` from the last 12 weeks: the fastest Riegel'd reference in a
 * band around the distance. The fastest, because easy long runs say little about race pace.
 */
export function recentRunSeconds(
  meters: number,
  efforts: RaceProjectionInputs['runEfforts'],
  asOf: Date,
): number | null {
  const predictions = recentRunPredictions(meters, efforts, asOf).map((point) => point.sec);
  return predictions.length > 0 ? Math.min(...predictions) : null;
}

/** The fastest reference of each week: easy runs mixed in would read as noise, not form. */
function weeklyBests(points: readonly TrendPoint[], asOf: Date): TrendPoint[] {
  const byWeek = new Map<number, TrendPoint>();
  for (const point of points) {
    const week = Math.floor((asOf.getTime() - timeMs(point.date)) / (7 * DAY_MS));
    const best = byWeek.get(week);
    if (!best || point.sec < best.sec) {
      byWeek.set(week, point);
    }
  }
  return [...byWeek.values()];
}

function thresholdRunSeconds(thresholdSecPerKm: number, meters: number): number {
  const proxySeconds = (thresholdSecPerKm * THRESHOLD_PROXY_METERS) / 1000;
  return riegelSeconds(proxySeconds, THRESHOLD_PROXY_METERS, meters);
}

export function projectRunLeg(
  meters: number,
  brickFactor: number,
  inputs: RaceProjectionInputs,
): LegEstimate {
  const predictions = recentRunPredictions(meters, inputs.runEfforts, inputs.asOf);
  if (predictions.length > 0) {
    return {
      sec: Math.min(...predictions.map((point) => point.sec)) * brickFactor,
      source: 'recent',
      trendPoints: weeklyBests(predictions, inputs.asOf),
    };
  }
  const threshold = inputs.profile.runThresholdPaceSecPerKm;
  if (threshold && threshold > 0) {
    return {
      sec: thresholdRunSeconds(threshold, meters) * brickFactor,
      source: 'profile',
      missing: MISSING.runProfile,
    };
  }
  return {
    sec: thresholdRunSeconds(DEFAULT_RUN_THRESHOLD_SEC_PER_KM, meters) * brickFactor,
    source: 'default',
    missing: MISSING.runDefault,
  };
}

function raceSwimPaceSecPer100m(legs: readonly MultisportLeg[]): number | null {
  const swims = legs.filter((leg) => leg.kind === 'swim' && (leg.distanceM ?? 0) > 0);
  const meters = swims.reduce((sum, leg) => sum + (leg.distanceM ?? 0), 0);
  const seconds = swims.reduce((sum, leg) => sum + leg.durationSec, 0);
  const pace = meters >= 400 ? seconds / (meters / 100) : null;
  return pace !== null && pace >= 60 && pace <= 300 ? pace : null;
}

export function projectSwimLeg(
  swimM: number,
  inputs: RaceProjectionInputs,
  pastRaceLegs: readonly MultisportLeg[][],
): LegEstimate {
  const racePace = medianOrNull(pastRaceLegs.flatMap((legs) => raceSwimPaceSecPer100m(legs) ?? []));
  if (racePace !== null) {
    return { sec: (swimM / 100) * racePace, source: 'history' };
  }
  const css = inputs.profile.swimCssSecPer100m;
  if (css && css > 0) {
    return { sec: (swimM / 100) * css * OPEN_WATER_FACTOR, source: 'profile' };
  }
  return {
    sec: (swimM / 100) * DEFAULT_CSS_SEC_PER_100M * OPEN_WATER_FACTOR,
    source: 'default',
    missing: MISSING.swimDefault,
  };
}

function longRideSpeeds(spec: FormatSpec, inputs: RaceProjectionInputs, recentOnly: boolean) {
  return inputs.rides
    .filter(
      (ride) =>
        (recentOnly ? isRecent(ride.date, inputs.asOf) : isBefore(ride.date, inputs.asOf)) &&
        ride.distanceM >= spec.bikeM * LONG_RIDE_SHARE &&
        ride.durationSec > 0,
    )
    .map((ride) => ({ date: ride.date, speed: ride.distanceM / ride.durationSec }))
    .filter((ride) => ride.speed > 4 && ride.speed < 18);
}

function medianSpeed(rides: readonly { speed: number }[]): number {
  return median(rides.map((ride) => ride.speed));
}

function ftpBikeSpeed(spec: FormatSpec, profile: RaceProjectionInputs['profile']): number | null {
  if (!profile.ftpW || profile.ftpW <= 0) {
    return null;
  }
  const weight = profile.weightKg && profile.weightKg > 40 ? profile.weightKg : DEFAULT_WEIGHT_KG;
  return estimateBikeSpeedMsFromPower(profile.ftpW * spec.bikeIf, weight);
}

export function projectBikeLeg(spec: FormatSpec, inputs: RaceProjectionInputs): LegEstimate {
  const recent = longRideSpeeds(spec, inputs, true);
  if (recent.length >= MIN_RIDES) {
    return {
      sec: spec.bikeM / medianSpeed(recent),
      source: 'recent',
      trendPoints: recent.map((ride) => ({ date: ride.date, sec: spec.bikeM / ride.speed })),
    };
  }
  const all = longRideSpeeds(spec, inputs, false);
  if (all.length >= MIN_RIDES) {
    return { sec: spec.bikeM / medianSpeed(all), source: 'history' };
  }
  const ftpSpeed = ftpBikeSpeed(spec, inputs.profile);
  if (ftpSpeed !== null) {
    return { sec: spec.bikeM / ftpSpeed, source: 'profile', missing: MISSING.bikeFtp };
  }
  if (all.length > 0) {
    return { sec: spec.bikeM / medianSpeed(all), source: 'history' };
  }
  return {
    sec: spec.bikeM / DEFAULT_BIKE_SPEED_MS,
    source: 'default',
    missing: MISSING.bikeDefault,
  };
}

export function projectTransitionLeg(
  transitionIndex: 1 | 2,
  defaultSec: number,
  pastRaceLegs: readonly MultisportLeg[][],
): LegEstimate {
  const past = pastRaceLegs
    .flatMap((legs) =>
      legs.filter((leg) => leg.kind === 'transition' && leg.transitionIndex === transitionIndex),
    )
    .map(legDisplayDurationSec)
    .filter((sec) => sec >= MIN_TRANSITION_SEC && sec <= MAX_TRANSITION_SEC);
  const own = medianOrNull(past);
  return own !== null ? { sec: own, source: 'history' } : { sec: defaultSec, source: 'default' };
}

function pastRaceLegsBefore(inputs: RaceProjectionInputs): MultisportLeg[][] {
  return inputs.pastRaces.flatMap((race) =>
    isBefore(race.date, inputs.asOf) && isMultisportLegArray(race.multisportLegs)
      ? [race.multisportLegs]
      : [],
  );
}

type KindedEstimate = LegEstimate & { kind: RaceProjectionLegKind };

function triathlonLegs(spec: FormatSpec, inputs: RaceProjectionInputs): KindedEstimate[] {
  const pastRaceLegs = pastRaceLegsBefore(inputs);
  return [
    { kind: 'swim', ...projectSwimLeg(spec.swimM, inputs, pastRaceLegs) },
    { kind: 't1', ...projectTransitionLeg(1, spec.defaultT1Sec, pastRaceLegs) },
    { kind: 'bike', ...projectBikeLeg(spec, inputs) },
    { kind: 't2', ...projectTransitionLeg(2, spec.defaultT2Sec, pastRaceLegs) },
    { kind: 'run', ...projectRunLeg(spec.runM, spec.brickRunFactor, inputs) },
  ];
}

/** Whether the model knows the race's format (a triathlon or a road running distance). */
export function isProjectableRace(goal: Pick<RaceGoalFields, 'raceFormat' | 'title'>): boolean {
  return (
    resolveTriathlonFormat(goal.raceFormat, goal.title) !== null ||
    resolveRunRaceMeters(goal.raceFormat, goal.title) !== null
  );
}

function projectLegs(goal: RaceGoalFields, inputs: RaceProjectionInputs): KindedEstimate[] | null {
  const format = resolveTriathlonFormat(goal.raceFormat, goal.title);
  if (format) {
    return triathlonLegs(triathlonDistances(format), inputs);
  }
  const meters = resolveRunRaceMeters(goal.raceFormat, goal.title);
  return meters === null ? null : [{ kind: 'run', ...projectRunLeg(meters, 1, inputs) }];
}

/** Share of legs standing on the athlete's own measured evidence. */
export function projectionConfidence(
  legs: readonly Pick<RaceProjectionLeg, 'source'>[],
): RaceProjectionConfidence {
  const measured = legs.filter((leg) => leg.source === 'recent' || leg.source === 'history');
  const share = measured.length / Math.max(1, legs.length);
  if (share >= 0.8) {
    return 'high';
  }
  return share >= 0.4 ? 'medium' : 'low';
}

/** Finish projection for a race goal; null for a format the model does not know. */
export function buildRaceProjection(
  goal: RaceGoalFields,
  inputs: RaceProjectionInputs,
): RaceProjection | null {
  const estimates = projectLegs(goal, inputs);
  if (!estimates) {
    return null;
  }
  const regularity = roundTo(regularityScore(inputs, inputs.asOf), 2);
  const weeks = weeksToRace(goal.targetDate ?? null, inputs.asOf);
  const trends = estimates.map((estimate) =>
    estimate.trendPoints ? legTrend(estimate.trendPoints) : null,
  );
  const legs = estimates.map(({ kind, sec, source }, i) => ({
    kind,
    sec: Math.round(sec * raceDayFactor(trends[i], regularity, weeks)),
    source,
  }));
  const todaySec = estimates.reduce((sum, estimate) => sum + Math.round(estimate.sec), 0);
  const finishSec = legs.reduce((sum, leg) => sum + leg.sec, 0);
  const confidence = projectionConfidence(legs);
  const irregularity = regularity === null ? 0 : 1 - regularity;
  const spread = Math.round(
    finishSec * SPREAD_BY_CONFIDENCE[confidence] * (1 + IRREGULARITY_SPREAD * irregularity),
  );
  const targetSec = parseRaceTargetSeconds(goal.targetPerformance);
  return {
    finishSec,
    todaySec,
    regularity,
    trend: { secPerWeek: secPerWeek(estimates, trends, regularity) },
    history: [],
    lowSec: finishSec - spread,
    highSec: finishSec + spread,
    targetSec,
    deltaSec: targetSec === null ? null : finishSec - targetSec,
    legs,
    confidence,
    missing: [...new Set(estimates.flatMap((leg) => leg.missing ?? []))],
    frozenAt: null,
  };
}

function roundTo(value: number | null, decimals: number): number | null {
  return value === null ? null : Number(value.toFixed(decimals));
}

/** Whole and partial weeks from `asOf` to race-day start; 0 once the race has come. */
function weeksToRace(targetDate: Date | string | null, asOf: Date): number {
  if (!targetDate) {
    return 0;
  }
  const raceStart = Date.parse(`${raceDayKey(targetDate)}T00:00:00Z`);
  return Math.max(0, (raceStart - asOf.getTime()) / (7 * DAY_MS));
}

function secPerWeek(
  estimates: readonly LegEstimate[],
  trends: readonly ReturnType<typeof legTrend>[],
  regularity: number | null,
): number | null {
  if (trends.every((trend) => trend === null)) {
    return null;
  }
  return Math.round(
    estimates.reduce((sum, estimate, i) => {
      const trend = trends[i];
      return trend ? sum + estimate.sec * appliedWeeklyRate(trend, regularity) : sum;
    }, 0),
  );
}

/** Evidence cut-off: now while the race is ahead, the start of race day once it has come. */
export function projectionAsOf(targetDate: Date | string | null, now: Date): Date {
  if (!targetDate) {
    return now;
  }
  const raceStart = new Date(`${raceDayKey(targetDate)}T00:00:00Z`);
  return raceStart < now ? raceStart : now;
}

/** A race's projection freezes the first time it is read from the eve of the race on. */
export function shouldFreezeProjection(
  goal: { kind: string; targetDate: Date | string | null; frozenProjectionAt: Date | null },
  trainingDayId: string,
): boolean {
  if (goal.kind !== 'RACE' || !goal.targetDate || goal.frozenProjectionAt) {
    return false;
  }
  const eve = new Date(Date.parse(`${trainingDayId}T00:00:00Z`) + DAY_MS);
  return isRaceDayReached(goal.targetDate, eve.toISOString().slice(0, 10));
}
