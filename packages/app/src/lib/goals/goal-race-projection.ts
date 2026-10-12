/**
 * Cap Position race finish projection — run (Riegel) or triathlon (segmented).
 */

import { formatChronoSeconds, parseChronoInput } from '@sharpit/app/lib/goals/goal-metric-config';
import type { GoalPositionLeg } from '@sharpit/app/lib/goals/goal-position-audit';
import {
  collectBikeSpeedSamples,
  collectBrickRunFactors,
  collectBrickTransitions,
  collectRaceTransitions,
  collectSwimPaceSamples,
} from '@sharpit/app/lib/goals/goal-triathlon-samples';
import {
  estimateFtp,
  predictRunRaces,
  type PredictionConfidence,
} from '@sharpit/app/lib/training/periodization/performance-predictor';
import {
  predictTriathlonFinish,
  resolveTriathlonFormat,
  type SwimPaceSample,
} from '@sharpit/app/lib/training/periodization/triathlon-performance-predictor';
import type {
  BikeEffort,
  PowerCurvePoint,
  RecordCategory,
  RunBestCategory,
  RunEffort,
} from '@sharpit/app/lib/training/records/record-types';

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

export type RaceFinishProjection = {
  readonly projectedFinishLabel: string;
  readonly projectedGapLabel: string | null;
  readonly confidence: PredictionConfidence;
  readonly referenceLabel: string;
  readonly statusDetail: string;
  readonly source: 'riegel' | 'triathlon';
  readonly legs: readonly GoalPositionLeg[];
};

function sharePct(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

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

function gapLabel(projectedSeconds: number, targetSeconds: number): string {
  const delta = Math.abs(projectedSeconds - targetSeconds);
  const deltaLabel = formatChronoSeconds(delta);
  if (projectedSeconds < targetSeconds) {
    return `${deltaLabel} sous la cible`;
  }
  if (projectedSeconds > targetSeconds) {
    return `${deltaLabel} au-dessus de la cible`;
  }
  return 'Aligné sur la cible';
}

type ActivitySampleSource = {
  id: string;
  type: string;
  date: Date | string;
  duration: number | null;
  runMetrics?: { distanceM: number | null } | null;
  swimMetrics?: { distanceM: number | null; avgPaceSecPer100m?: number | null } | null;
  multisportLegs?: unknown;
};

type SessionSampleSource = {
  id: string;
  type: string;
  brickGroupId: string | null;
  brickOrder: number | null;
  activityId: string | null;
};

function swimPaceSamplesFromRecords(
  prsSwim: readonly RecordCategory[] | undefined,
): SwimPaceSample[] {
  const pace = prsSwim?.find((category) => category.key === 'swim-pace')?.entries[0]?.value;
  if (!pace || pace <= 0) {
    return [];
  }
  return [{ paceSecPer100m: pace, distanceM: 1500 }];
}

function triathlonLegsFromPrediction(
  prediction: NonNullable<ReturnType<typeof predictTriathlonFinish>>,
): GoalPositionLeg[] {
  const { segmentLabels: labels, segments, sources, seconds } = prediction;
  return [
    {
      kind: 'swim',
      label: 'Natation',
      timeLabel: labels.swim,
      sharePct: sharePct(segments.swim, seconds),
      source: sources.swim,
    },
    {
      kind: 't1',
      label: 'T1',
      timeLabel: labels.t1,
      sharePct: sharePct(segments.t1, seconds),
      source: sources.t1,
    },
    {
      kind: 'bike',
      label: 'Vélo',
      timeLabel: labels.bike,
      sharePct: sharePct(segments.bike, seconds),
      source: sources.bike,
    },
    {
      kind: 't2',
      label: 'T2',
      timeLabel: labels.t2,
      sharePct: sharePct(segments.t2, seconds),
      source: sources.t2,
    },
    {
      kind: 'run',
      label: 'Course',
      timeLabel: labels.run,
      sharePct: sharePct(segments.run, seconds),
      source: sources.run,
    },
  ];
}

function toTriathlonRaceProjection(
  format: NonNullable<ReturnType<typeof resolveTriathlonFormat>>,
  prediction: NonNullable<ReturnType<typeof predictTriathlonFinish>>,
  targetPerformance: string | null,
): RaceFinishProjection {
  const targetSeconds = parseRaceTargetSeconds(targetPerformance);
  const labels = prediction.segmentLabels;
  return {
    projectedFinishLabel: prediction.displayTime,
    projectedGapLabel: targetSeconds !== null ? gapLabel(prediction.seconds, targetSeconds) : null,
    confidence: prediction.confidence,
    referenceLabel: `${labels.swim} · T1 ${labels.t1} · ${labels.bike} · T2 ${labels.t2} · ${labels.run}`,
    statusDetail: `Étapes ${format} : nage ${labels.swim} → T1 ${labels.t1} → vélo ${labels.bike} → T2 ${labels.t2} → course ${labels.run}`,
    source: 'triathlon',
    legs: triathlonLegsFromPrediction(prediction),
  };
}

function buildTriathlonProjection(input: {
  raceFormat: string | null;
  title: string | null;
  targetPerformance: string | null;
  swimCssSecPer100m: number | null;
  ftpW: number | null;
  runThresholdPaceSecPerKm: number | null;
  weightKg: number | null;
  runBests: readonly RunBestCategory[];
  runEfforts: readonly RunEffort[];
  prsSwim?: readonly RecordCategory[];
  activities: readonly ActivitySampleSource[];
  sessions: readonly SessionSampleSource[];
}): RaceFinishProjection | null {
  const format = resolveTriathlonFormat(input.raceFormat, input.title);
  if (!format) {
    return null;
  }

  const prediction = predictTriathlonFinish({
    format,
    swimCssSecPer100m: input.swimCssSecPer100m,
    swimPaceSamples: [
      ...collectSwimPaceSamples(input.activities),
      ...swimPaceSamplesFromRecords(input.prsSwim),
    ],
    bikeSpeedSamples: collectBikeSpeedSamples(input.activities),
    ftpW: input.ftpW,
    weightKg: input.weightKg,
    runBests: input.runBests,
    runEfforts: input.runEfforts,
    raceTransitions: collectRaceTransitions(input.activities),
    brickTransitions: collectBrickTransitions(input.sessions, input.activities),
    brickRunFactors: collectBrickRunFactors(
      input.sessions,
      input.activities,
      input.runThresholdPaceSecPerKm,
    ),
  });

  if (!prediction) {
    return null;
  }

  return toTriathlonRaceProjection(format, prediction, input.targetPerformance);
}

function buildRunProjection(input: {
  raceFormat: string | null;
  title: string | null;
  targetPerformance: string | null;
  runBests: readonly RunBestCategory[];
  runEfforts: readonly RunEffort[];
}): RaceFinishProjection | null {
  const meters = resolveRunRaceMeters(input.raceFormat, input.title);
  if (meters === null) {
    return null;
  }

  const predictions = predictRunRaces([...input.runBests], [...input.runEfforts]);
  const prediction = predictions.find((entry) => entry.meters === meters);
  if (!prediction) {
    return null;
  }

  const targetSeconds = parseRaceTargetSeconds(input.targetPerformance);
  return {
    projectedFinishLabel: prediction.displayTime,
    projectedGapLabel: targetSeconds !== null ? gapLabel(prediction.seconds, targetSeconds) : null,
    confidence: prediction.confidence,
    referenceLabel: prediction.referenceLabel,
    statusDetail: `Riegel · base ${prediction.referenceLabel}`,
    source: 'riegel',
    legs: [
      {
        kind: 'run',
        label: prediction.label,
        timeLabel: prediction.displayTime,
        sharePct: 100,
        source: `Riegel · ${prediction.referenceLabel}`,
      },
    ],
  };
}

function resolveProjectionFtpW(input: {
  ftpW?: number | null;
  powerCurve?: readonly PowerCurvePoint[];
  bikeEfforts?: readonly BikeEffort[];
}): number | null {
  return (
    input.ftpW ??
    estimateFtp([...(input.powerCurve ?? [])], [...(input.bikeEfforts ?? [])])?.watts ??
    null
  );
}

export function buildRaceFinishProjection(input: {
  raceFormat: string | null;
  title: string | null;
  targetPerformance: string | null;
  runBests: readonly RunBestCategory[];
  runEfforts?: readonly RunEffort[];
  /** Optional triathlon inputs — when omitted, only run Riegel is attempted. */
  swimCssSecPer100m?: number | null;
  ftpW?: number | null;
  runThresholdPaceSecPerKm?: number | null;
  weightKg?: number | null;
  powerCurve?: readonly PowerCurvePoint[];
  bikeEfforts?: readonly BikeEffort[];
  prsSwim?: readonly RecordCategory[];
  activities?: readonly ActivitySampleSource[];
  sessions?: readonly SessionSampleSource[];
}): RaceFinishProjection | null {
  const runEfforts = input.runEfforts ?? [];
  const triathlon = buildTriathlonProjection({
    raceFormat: input.raceFormat,
    title: input.title,
    targetPerformance: input.targetPerformance,
    swimCssSecPer100m: input.swimCssSecPer100m ?? null,
    ftpW: resolveProjectionFtpW(input),
    runThresholdPaceSecPerKm: input.runThresholdPaceSecPerKm ?? null,
    weightKg: input.weightKg ?? null,
    runBests: input.runBests,
    runEfforts,
    prsSwim: input.prsSwim,
    activities: input.activities ?? [],
    sessions: input.sessions ?? [],
  });
  return (
    triathlon ??
    buildRunProjection({
      raceFormat: input.raceFormat,
      title: input.title,
      targetPerformance: input.targetPerformance,
      runBests: input.runBests,
      runEfforts,
    })
  );
}
