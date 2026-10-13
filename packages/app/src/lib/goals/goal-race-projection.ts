import {
  isMultisportLegArray,
  legDisplayDurationSec,
  type MultisportLeg,
} from '@sharpit/app/lib/activity/multisport';
import { parseChronoInput } from '@sharpit/app/lib/goals/goal-metric-config';
import { isRaceDayReached, raceDayKey } from '@sharpit/app/lib/goals/race-moment';
import { median } from '@sharpit/app/lib/journal/journal-habit-analysis';
import {
  decayedBest,
  inCapacityWindow,
  raceTargetHr,
  smoothedWeekly,
  paceAtHr,
  type DatedValue,
} from '@sharpit/app/lib/goals/goal-race-capacity';
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
  type TriathlonFormat,
} from '@sharpit/app/lib/training/periodization/triathlon-performance-predictor';
import {
  BIKE_FLAT_M_PER_CLIMB_M,
  RACE_DISCIPLINES,
  RUN_FLAT_M_PER_CLIMB_M,
  RUN_RACE_METERS,
  missingLegs,
  resolveStructuredRace,
  type StructuredRace,
} from '@sharpit/app/lib/goals/race-formats';

const RUN_RACE_TARGETS: readonly {
  meters: number;
  /** Race HR as a share of LTHR (ADR-081). */
  hrFactor: number;
  patterns: readonly RegExp[];
}[] = [
  {
    meters: RUN_RACE_METERS.k5,
    hrFactor: 1.02,
    patterns: [/\b5\s*k(?:m)?\b/i, /\b5000\s*m\b/i],
  },
  {
    meters: RUN_RACE_METERS.k10,
    hrFactor: 1.0,
    patterns: [/\b10\s*k(?:m)?\b/i, /\b10000\s*m\b/i],
  },
  {
    meters: RUN_RACE_METERS.semi,
    hrFactor: 0.95,
    patterns: [
      /\bsemi[- ]?marathon\b/i,
      /\bsemi\b/i,
      /\bhalf[- ]?marathon\b/i,
      /\b21(?:[.,]1)?\s*k(?:m)?\b/i,
    ],
  },
  {
    meters: RUN_RACE_METERS.marathon,
    hrFactor: 0.9,
    patterns: [/\bmarathon\b/i, /\b42(?:[.,]2)?\s*k(?:m)?\b/i],
  },
];

const MULTISPORT_BLOCK =
  /\b(?:half\s*)?iron(?:man)?\b|\btriathlon\b|\bduathlon\b|\bswimrun\b|\bolympique\b|\bolympic\b|\b70\.3\b|\bim\b/i;

/** Resolve a supported run race distance from format / title, or null. */
export function resolveRunRaceMeters(
  raceFormat: string | null,
  title: string | null,
): number | null {
  return resolveRunRace(raceFormat, title)?.meters ?? null;
}

function resolveRunRace(raceFormat: string | null, title: string | null) {
  const haystack = [raceFormat, title].filter(Boolean).join(' · ');
  if (!haystack.trim()) {
    return null;
  }
  if (MULTISPORT_BLOCK.test(haystack)) {
    return null;
  }

  for (const target of RUN_RACE_TARGETS) {
    if (target.patterns.some((pattern) => pattern.test(haystack))) {
      return target;
    }
  }
  return null;
}

const TRIATHLON_FORMAT_KEYS: Record<TriathlonFormat, string> = {
  sprint: 'TRI_S',
  olympic: 'TRI_M',
  half: 'TRI_L',
  full: 'TRI_XXL',
};

const RUN_FORMAT_KEYS: Record<number, string> = {
  [RUN_RACE_METERS.k5]: 'RUN_5K',
  [RUN_RACE_METERS.k10]: 'RUN_10K',
  [RUN_RACE_METERS.semi]: 'RUN_SEMI',
  [RUN_RACE_METERS.marathon]: 'RUN_MARATHON',
};

/**
 * Best-effort structured race read from a goal's free text (backfill of goals made before
 * ADR-082): the triathlon or road format the projection already recognised, and the target.
 */
export function structuredRaceFromText(
  goal: Pick<RaceGoalFields, 'raceFormat' | 'title' | 'targetPerformance'>,
): (Pick<StructuredRace, 'discipline' | 'formatKey'> & { targetSeconds: number | null }) | null {
  const targetSeconds = parseRaceTargetSeconds(goal.targetPerformance);
  const triathlon = resolveTriathlonFormat(goal.raceFormat, goal.title);
  if (triathlon) {
    return { discipline: 'TRIATHLON', formatKey: TRIATHLON_FORMAT_KEYS[triathlon], targetSeconds };
  }
  const runMeters = resolveRunRaceMeters(goal.raceFormat, goal.title);
  return runMeters === null
    ? null
    : { discipline: 'RUN', formatKey: RUN_FORMAT_KEYS[runMeters]!, targetSeconds };
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
 * Per leg, the most specific evidence wins: the athlete's past races ('history'), then recent
 * training ('recent': run capacity from goal-race-capacity over 26 weeks, bike medians over 12),
 * then the profile thresholds ('profile'), then amateur defaults ('default'). Calibrated from
 * past linked races: T1/T2 (their median) and the swim pace per 100 m (a factor against today's
 * CSS would reduce to that same pace).
 */

export type RaceProjectionLegKind = 'swim' | 't1' | 'bike' | 't2' | 'run';
export type RaceProjectionSource = 'history' | 'recent' | 'profile' | 'default';
export type RaceProjectionConfidence = 'low' | 'medium' | 'high';

/** How a run or bike leg was read: run HR curve, age-decayed best, median long ride, profile. */
export type RaceProjectionMethod = 'hr-curve' | 'decayed-best' | 'median' | 'profile' | 'default';

export type RaceProjectionLeg = {
  kind: RaceProjectionLegKind;
  sec: number;
  source: RaceProjectionSource;
  method?: RaceProjectionMethod;
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
    lthr: number | null;
    maxHr: number | null;
  };
  /** Run references: whole runs (with their average HR) and stream bests per distance. */
  runEfforts: readonly {
    meters: number;
    seconds: number;
    date: Date | string;
    avgHr?: number | null;
  }[];
  rides: readonly { date: Date | string; distanceM: number; durationSec: number }[];
  /** Activities linked to race goals; only multisport ones calibrate. */
  pastRaces: readonly { date: Date | string; multisportLegs: unknown }[];
};

/** Structured race fields (ADR-082); when complete they replace the free-text guessing. */
type StructuredGoalFields = Partial<Omit<StructuredRace, 'discipline' | 'formatKey'>> & {
  discipline?: string | null;
  formatKey?: string | null;
  targetSeconds?: number | null;
};

type RaceGoalFields = StructuredGoalFields & {
  targetDate?: Date | string | null;
  raceFormat: string | null;
  title: string | null;
  targetPerformance: string | null;
};

type TrendPoint = DatedValue;
type LegEstimate = {
  sec: number;
  source: RaceProjectionSource;
  method?: RaceProjectionMethod;
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
/** Swim-only open water: no wetsuit assumed, sighting, no push-offs — slower than pool CSS. */
const SWIM_RACE_OPEN_WATER_FACTOR = 1.03;
/** CSS ≈ the pace an athlete holds over 1500 m; Riegel prices the other swim distances from it. */
const CSS_REFERENCE_METERS = 1500;
/** Swimrun: swimming in shoes (with paddles / pull-buoy) ≈ CSS × 1.1. */
const SWIMRUN_SWIM_FACTOR = 1.1;
/** Swimrun run: wet shoes on trails and rocks, ≈ 10 % slower than the flat-equivalent run. */
const SWIMRUN_RUN_FACTOR = 1.1;
/** Swimrun: one water entry or exit per segment, folded into the swim leg. */
const SWIMRUN_TRANSITION_SEC = 30;
/** Duathlon transitions: no wetsuit, so shorter than a triathlon's (amateur defaults). */
const DUATHLON_T1_SEC = 75;
const DUATHLON_T2_SEC = 60;
/** Threshold pace ≈ a 1 h effort ≈ 15 km for an amateur (as estimateRunThresholdPace). */
const THRESHOLD_PROXY_METERS = 15_000;
/** Shortest reference Riegel may extrapolate from: short bests over-promise long races. */
const MIN_RUN_REF_METERS = 3000;
const MIN_RUN_REF_SHARE = 0.2;
const MAX_RUN_REF_MULTIPLE = 3;
/** Faster than 2:30/km is a mislabelled activity, not a run. */
const FASTEST_RUN_PACE_SEC_PER_KM = 150;
/** Slower than 10:00/km is walking: no place on the pace–HR curve. */
const SLOWEST_RUN_PACE_SEC_PER_KM = 600;
/** The HR curve never beats the decayed best reference by more than 3 %. */
const MAX_CURVE_GAIN = 0.97;
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

/** Riegel'd standalone times over `meters` from the 26-week references around it. */
function runReferences(
  meters: number,
  efforts: RaceProjectionInputs['runEfforts'],
  asOf: Date,
): TrendPoint[] {
  const minMeters = Math.max(MIN_RUN_REF_METERS, MIN_RUN_REF_SHARE * meters);
  return efforts
    .filter(
      (effort) =>
        inCapacityWindow(effort.date, asOf) &&
        effort.meters >= minMeters &&
        effort.meters <= MAX_RUN_REF_MULTIPLE * meters &&
        (effort.seconds / effort.meters) * 1000 >= FASTEST_RUN_PACE_SEC_PER_KM,
    )
    .map((effort) => ({
      date: effort.date,
      sec: riegelSeconds(effort.seconds, effort.meters, meters),
    }));
}

/** Standalone time over `meters` at the race's target HR, from the 26-week pace–HR curve. */
function hrCurveRunSeconds(
  meters: number,
  hrFactor: number,
  inputs: RaceProjectionInputs,
): number | null {
  const points = inputs.runEfforts.flatMap((effort) => {
    const pace = (effort.seconds / effort.meters) * 1000;
    return effort.avgHr &&
      effort.avgHr > 0 &&
      inCapacityWindow(effort.date, inputs.asOf) &&
      effort.meters >= MIN_RUN_REF_METERS &&
      pace >= FASTEST_RUN_PACE_SEC_PER_KM &&
      pace <= SLOWEST_RUN_PACE_SEC_PER_KM
      ? [{ hr: effort.avgHr, value: pace }]
      : [];
  });
  const pace = paceAtHr(points, raceTargetHr(inputs.profile, hrFactor));
  return pace !== null && pace >= FASTEST_RUN_PACE_SEC_PER_KM ? (pace * meters) / 1000 : null;
}

function thresholdRunSeconds(thresholdSecPerKm: number, meters: number): number {
  const proxySeconds = (thresholdSecPerKm * THRESHOLD_PROXY_METERS) / 1000;
  return riegelSeconds(proxySeconds, THRESHOLD_PROXY_METERS, meters);
}

/**
 * Run capacity: the faster of the pace–HR curve at race HR (never under 0.97 × the best) and
 * the age-decayed best reference, × the brick factor; the profile threshold only when neither exists.
 */
export function projectRunLeg(
  meters: number,
  brickFactor: number,
  hrFactor: number,
  inputs: RaceProjectionInputs,
): LegEstimate {
  const references = runReferences(meters, inputs.runEfforts, inputs.asOf);
  const best = decayedBest(references, inputs.asOf);
  const curve = hrCurveRunSeconds(meters, hrFactor, inputs);
  // The curve may beat the best reference, but by 3 % at most: past that it extrapolates.
  const boundedCurve =
    curve !== null && best !== null ? Math.max(curve, best * MAX_CURVE_GAIN) : curve;
  const readings = (
    [
      { method: 'hr-curve', sec: boundedCurve },
      { method: 'decayed-best', sec: best },
    ] as const
  ).flatMap((reading) => (reading.sec === null ? [] : [{ ...reading, sec: reading.sec }]));
  if (readings.length > 0) {
    const fastest = readings.reduce((best, reading) => (reading.sec < best.sec ? reading : best));
    const recent = references.filter((reference) => isRecent(reference.date, inputs.asOf));
    return {
      sec: fastest.sec * brickFactor,
      source: 'recent',
      method: fastest.method,
      trendPoints: smoothedWeekly(recent, inputs.asOf, (week) => Math.min(...week)),
    };
  }
  const threshold = inputs.profile.runThresholdPaceSecPerKm;
  if (threshold && threshold > 0) {
    return {
      sec: thresholdRunSeconds(threshold, meters) * brickFactor,
      source: 'profile',
      method: 'profile',
      missing: MISSING.runProfile,
    };
  }
  return {
    sec: thresholdRunSeconds(DEFAULT_RUN_THRESHOLD_SEC_PER_KM, meters) * brickFactor,
    source: 'default',
    method: 'default',
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

/** Swim time at the profile CSS (else the amateur default) × `factor`. */
function cssSwimLeg(swimM: number, factor: number, inputs: RaceProjectionInputs): LegEstimate {
  const css = inputs.profile.swimCssSecPer100m;
  if (css && css > 0) {
    return { sec: (swimM / 100) * css * factor, source: 'profile' };
  }
  return {
    sec: (swimM / 100) * DEFAULT_CSS_SEC_PER_100M * factor,
    source: 'default',
    missing: MISSING.swimDefault,
  };
}

/** Triathlon swim: past race pace, else CSS (× 0.98 in open water, × 1 in a pool). */
export function projectSwimLeg(
  swimM: number,
  inputs: RaceProjectionInputs,
  pastRaceLegs: readonly MultisportLeg[][],
  openWater = true,
): LegEstimate {
  const racePace = medianOrNull(pastRaceLegs.flatMap((legs) => raceSwimPaceSecPer100m(legs) ?? []));
  if (racePace !== null) {
    return { sec: (swimM / 100) * racePace, source: 'history' };
  }
  return cssSwimLeg(swimM, openWater ? OPEN_WATER_FACTOR : 1, inputs);
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

/**
 * Bike: median long ride, else FTP. No HR curve: speed depends on terrain and wind, so an
 * HR → speed fit does not transfer to race HR (prod backtest: 35 km/h for a real 27.4).
 */
export function projectBikeLeg(spec: FormatSpec, inputs: RaceProjectionInputs): LegEstimate {
  const recent = longRideSpeeds(spec, inputs, true);
  const trendPoints = smoothedWeekly(
    recent.map((ride) => ({ date: ride.date, sec: spec.bikeM / ride.speed })),
    inputs.asOf,
    median,
  );
  if (recent.length >= MIN_RIDES) {
    return {
      sec: spec.bikeM / medianSpeed(recent),
      source: 'recent',
      method: 'median',
      trendPoints,
    };
  }
  const all = longRideSpeeds(spec, inputs, false);
  if (all.length >= MIN_RIDES) {
    return { sec: spec.bikeM / medianSpeed(all), source: 'history', method: 'median' };
  }
  const ftpSpeed = ftpBikeSpeed(spec, inputs.profile);
  if (ftpSpeed !== null) {
    return {
      sec: spec.bikeM / ftpSpeed,
      source: 'profile',
      method: 'profile',
      missing: MISSING.bikeFtp,
    };
  }
  if (all.length > 0) {
    return { sec: spec.bikeM / medianSpeed(all), source: 'history', method: 'median' };
  }
  return {
    sec: spec.bikeM / DEFAULT_BIKE_SPEED_MS,
    source: 'default',
    method: 'default',
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

type Course = Pick<StructuredRace, 'openWater' | 'bikeElevationM' | 'runElevationM'>;

function triathlonLegs(
  spec: FormatSpec,
  inputs: RaceProjectionInputs,
  course: Course = {},
): KindedEstimate[] {
  const pastRaceLegs = pastRaceLegsBefore(inputs);
  const runM = runEffortMeters(spec.runM, course.runElevationM);
  return [
    {
      kind: 'swim',
      ...projectSwimLeg(spec.swimM, inputs, pastRaceLegs, course.openWater !== false),
    },
    { kind: 't1', ...projectTransitionLeg(1, spec.defaultT1Sec, pastRaceLegs) },
    { kind: 'bike', ...climbingBikeLeg(spec, course.bikeElevationM, inputs) },
    { kind: 't2', ...projectTransitionLeg(2, spec.defaultT2Sec, pastRaceLegs) },
    { kind: 'run', ...projectRunLeg(runM, spec.brickRunFactor, spec.runHrFactor, inputs) },
  ];
}

/*
 * Structured races (ADR-082): the race's own distances and climbing. Climbing turns into
 * flat-equivalent distance — on foot 100 m D+ ≈ 1 km, on a bike 1000 m D+ ≈ 15 km
 * (race-formats.ts) — so a road race without D+ projects exactly as v2.
 */

function runEffortMeters(meters: number, climbM: number | null | undefined): number {
  return meters + RUN_FLAT_M_PER_CLIMB_M * (climbM ?? 0);
}

function climbingBikeLeg(
  spec: FormatSpec,
  climbM: number | null | undefined,
  inputs: RaceProjectionInputs,
): LegEstimate {
  const leg = projectBikeLeg(spec, inputs);
  return { ...leg, sec: leg.sec * (1 + (BIKE_FLAT_M_PER_CLIMB_M * (climbM ?? 0)) / spec.bikeM) };
}

/** Race HR factor of the closest road distance (5 km … marathon) to `meters`. */
function nearestRunHrFactor(meters: number): number {
  const gap = (target: number) => Math.abs(Math.log(meters / target));
  return RUN_RACE_TARGETS.reduce((best, target) =>
    gap(target.meters) < gap(best.meters) ? target : best,
  ).hrFactor;
}

const TRIATHLON_SPECS = (['sprint', 'olympic', 'half', 'full'] as const).map(triathlonDistances);

/**
 * Race defaults (transitions, bike IF, brick and HR factors) of the triathlon format nearest
 * to the given legs by mean |log ratio|, carrying the race's own distances.
 */
function nearestSpec(legs: Pick<StructuredRace, 'swimM' | 'bikeM' | 'runM'>): FormatSpec {
  const given = (['swimM', 'bikeM', 'runM'] as const).filter((leg) => (legs[leg] ?? 0) > 0);
  const score = (spec: FormatSpec) =>
    given.reduce((sum, leg) => sum + Math.abs(Math.log(legs[leg]! / spec[leg])), 0);
  const nearest = TRIATHLON_SPECS.reduce((best, spec) => (score(spec) < score(best) ? spec : best));
  return { ...nearest, swimM: legs.swimM ?? 0, bikeM: legs.bikeM ?? 0, runM: legs.runM ?? 0 };
}

function runRaceLegs(race: StructuredRace, inputs: RaceProjectionInputs): KindedEstimate[] {
  const meters = runEffortMeters(race.runM!, race.runElevationM);
  return [{ kind: 'run', ...projectRunLeg(meters, 1, nearestRunHrFactor(meters), inputs) }];
}

/** Swim-only race: CSS priced by Riegel from 1500 m, × 1.03 in open water. */
function swimRaceLegs(race: StructuredRace, inputs: RaceProjectionInputs): KindedEstimate[] {
  const distanceFactor = (race.swimM! / CSS_REFERENCE_METERS) ** (RIEGEL_EXPONENT - 1);
  const waterFactor = race.openWater === false ? 1 : SWIM_RACE_OPEN_WATER_FACTOR;
  return [{ kind: 'swim', ...cssSwimLeg(race.swimM!, distanceFactor * waterFactor, inputs) }];
}

/**
 * Duathlon: both runs priced as one effort over their total distance (so the first run is not a
 * standalone race), split by distance; the second × the brick factor of the nearest format.
 */
function duathlonLegs(race: StructuredRace, inputs: RaceProjectionInputs): KindedEstimate[] {
  const spec = nearestSpec({ bikeM: race.bikeM });
  const pastRaceLegs = pastRaceLegsBefore(inputs);
  const totalRunM = race.runM! + race.run2M!;
  const run = projectRunLeg(
    runEffortMeters(totalRunM, race.runElevationM),
    1,
    spec.runHrFactor,
    inputs,
  );
  return [
    { kind: 'run', ...run, sec: (run.sec * race.runM!) / totalRunM },
    { kind: 't1', sec: DUATHLON_T1_SEC, source: 'default' },
    { kind: 'bike', ...climbingBikeLeg(spec, race.bikeElevationM, inputs) },
    { kind: 't2', ...projectTransitionLeg(2, DUATHLON_T2_SEC, pastRaceLegs) },
    { kind: 'run', ...run, sec: ((run.sec * race.run2M!) / totalRunM) * spec.brickRunFactor },
  ];
}

/** Swimrun: CSS × 1.1 plus 30 s per segment; the run as a trail × 1.1. */
function swimrunLegs(race: StructuredRace, inputs: RaceProjectionInputs): KindedEstimate[] {
  const swim = cssSwimLeg(race.swimM!, SWIMRUN_SWIM_FACTOR, inputs);
  const runM = runEffortMeters(race.runM!, race.runElevationM);
  const run = projectRunLeg(runM, SWIMRUN_RUN_FACTOR, nearestRunHrFactor(runM), inputs);
  return [
    { kind: 'swim', ...swim, sec: swim.sec + (race.segments ?? 0) * SWIMRUN_TRANSITION_SEC },
    { kind: 'run', ...run },
  ];
}

function structuredLegs(race: StructuredRace, inputs: RaceProjectionInputs): KindedEstimate[] {
  switch (race.discipline) {
    case 'RUN':
    case 'TRAIL':
      return runRaceLegs(race, inputs);
    case 'BIKE':
      return [{ kind: 'bike', ...climbingBikeLeg(nearestSpec(race), race.bikeElevationM, inputs) }];
    case 'SWIM':
      return swimRaceLegs(race, inputs);
    case 'TRIATHLON':
      return triathlonLegs(nearestSpec(race), inputs, race);
    case 'DUATHLON':
      return duathlonLegs(race, inputs);
    case 'SWIMRUN':
      return swimrunLegs(race, inputs);
  }
}

/** The goal's structured race when complete enough to project, else null (free text then). */
function structuredRace(goal: StructuredGoalFields): StructuredRace | null {
  const discipline = RACE_DISCIPLINES.find((d) => d === goal.discipline);
  if (!discipline || !goal.formatKey) {
    return null;
  }
  const race = resolveStructuredRace({ ...goal, discipline, formatKey: goal.formatKey });
  return race && missingLegs(race).length === 0 ? race : null;
}

/** Whether the model knows the race: structured fields, else a triathlon or road distance in the text. */
export function isProjectableRace(
  goal: Pick<RaceGoalFields, 'raceFormat' | 'title'> & StructuredGoalFields,
): boolean {
  return (
    structuredRace(goal) !== null ||
    resolveTriathlonFormat(goal.raceFormat, goal.title) !== null ||
    resolveRunRaceMeters(goal.raceFormat, goal.title) !== null
  );
}

function projectLegs(goal: RaceGoalFields, inputs: RaceProjectionInputs): KindedEstimate[] | null {
  const structured = structuredRace(goal);
  if (structured) {
    return structuredLegs(structured, inputs);
  }
  const format = resolveTriathlonFormat(goal.raceFormat, goal.title);
  if (format) {
    return triathlonLegs(triathlonDistances(format), inputs);
  }
  const race = resolveRunRace(goal.raceFormat, goal.title);
  return race === null
    ? null
    : [{ kind: 'run', ...projectRunLeg(race.meters, 1, race.hrFactor, inputs) }];
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
  const legs = estimates.map(({ kind, sec, source, method }, i) => ({
    kind,
    sec: Math.round(sec * raceDayFactor(trends[i], regularity, weeks)),
    source,
    ...(method ? { method } : {}),
  }));
  const todaySec = estimates.reduce((sum, estimate) => sum + Math.round(estimate.sec), 0);
  const finishSec = legs.reduce((sum, leg) => sum + leg.sec, 0);
  const confidence = projectionConfidence(legs);
  const irregularity = regularity === null ? 0 : 1 - regularity;
  const spread = Math.round(
    finishSec * SPREAD_BY_CONFIDENCE[confidence] * (1 + IRREGULARITY_SPREAD * irregularity),
  );
  const targetSec = goal.targetSeconds ?? parseRaceTargetSeconds(goal.targetPerformance);
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

export type ProjectionVerdict = 'ambitious' | 'realistic' | 'cautious';

/** A target up to 3 % under the range's fast end still reads as realistic. */
const AMBITION_MARGIN = 0.03;

export const PROJECTION_VERDICT_LABELS: Record<ProjectionVerdict, string> = {
  ambitious: 'Ambitieux au vu de ta forme actuelle',
  realistic: 'Réaliste',
  cautious: 'Prudent : tu as de la marge',
};

/** A target against the race-day range: faster than low − 3 % is ambitious, slower than high cautious. */
export function projectionVerdict(
  projection: Pick<RaceProjection, 'lowSec' | 'highSec'>,
  targetSec: number | null,
): ProjectionVerdict | null {
  if (targetSec === null) {
    return null;
  }
  if (targetSec < projection.lowSec * (1 - AMBITION_MARGIN)) {
    return 'ambitious';
  }
  return targetSec > projection.highSec ? 'cautious' : 'realistic';
}
