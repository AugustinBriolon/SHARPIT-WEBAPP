import { legKindLabel, type MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import type {
  RaceAnalysis,
  RaceAnalysisLeg,
  RaceLegPacing,
} from '@sharpit/app/lib/activity/race-analysis-types';
import { parseRaceTargetSeconds } from '@sharpit/app/lib/goals/goal-race-projection';
import type { ActivityStreamPayload, StreamSample } from '@sharpit/app/lib/streams/stream-types';

export type RaceLegInput = { leg: MultisportLeg; stream: ActivityStreamPayload | null };

export type RaceAnalysisInput = {
  durationSec: number | null;
  load: number | null;
  targetPerformance: string | null;
  legs: RaceLegInput[];
};

const MIN_PACING_SAMPLES = 4;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function legLabel(leg: MultisportLeg): string {
  return leg.kind === 'run' ? 'Course à pied' : legKindLabel(leg.kind, leg.transitionIndex);
}

type Half = { seconds: number; meters: number };

/** Time-split halves of a leg (distance and time covered in each), or null when unusable. */
function streamHalves(samples: StreamSample[]): [Half, Half] | null {
  if (samples.length < MIN_PACING_SAMPLES) {
    return null;
  }
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const middleTime = (first.t + last.t) / 2;
  const middle = samples.find((sample) => sample.t >= middleTime) ?? last;
  const halves: [Half, Half] = [
    { seconds: middle.t - first.t, meters: middle.d - first.d },
    { seconds: last.t - middle.t, meters: last.d - middle.d },
  ];
  return halves.every((half) => half.seconds > 0 && half.meters > 0) ? halves : null;
}

const PACE_UNITS = {
  swim: { unit: 'sec_per_100m', perMeters: 100 },
  run: { unit: 'sec_per_km', perMeters: 1000 },
} as const;

/** Pace per half; positive change = slower second half, for paces and speeds alike. */
function legPacing(leg: MultisportLeg, stream: ActivityStreamPayload | null): RaceLegPacing | null {
  if (leg.kind === 'transition' || !stream?.has.distance) {
    return null;
  }
  const halves = streamHalves(stream.samples);
  if (!halves) {
    return null;
  }
  const [a, b] = halves;
  if (leg.kind === 'bike') {
    const [first, second] = [(a.meters / a.seconds) * 3.6, (b.meters / b.seconds) * 3.6];
    return {
      unit: 'kmh',
      firstHalf: round1(first),
      secondHalf: round1(second),
      changePct: round1((first / second - 1) * 100),
    };
  }
  const { unit, perMeters } = PACE_UNITS[leg.kind];
  const [first, second] = [a.seconds / (a.meters / perMeters), b.seconds / (b.meters / perMeters)];
  return {
    unit,
    firstHalf: round1(first),
    secondHalf: round1(second),
    changePct: round1((second / first - 1) * 100),
  };
}

function hrZonesSec(stream: ActivityStreamPayload | null): number[] | null {
  const zones = stream?.has.hr ? stream.analysis?.hr.zones : null;
  return zones && zones.length > 0 ? zones.map((zone) => Math.round(zone.seconds)) : null;
}

function analyzeLeg({ leg, stream }: RaceLegInput): RaceAnalysisLeg {
  const avgHr = leg.avgHr ?? stream?.stats?.avgHr ?? null;
  return {
    kind: leg.kind,
    label: legLabel(leg),
    durationSec: leg.durationSec,
    distanceM: leg.distanceM,
    sourceActivityId: leg.sourceActivityId ?? null,
    avgHr: avgHr === null ? null : Math.round(avgHr),
    hrZonesSec: leg.kind === 'transition' ? null : hrZonesSec(stream),
    pacing: legPacing(leg, stream),
  };
}

function runHrDriftPct(legs: RaceLegInput[]): number | null {
  const run = legs.find(({ leg }) => leg.kind === 'run');
  const drift = run?.stream?.analysis?.hr.decouplingPct;
  return typeof drift === 'number' && Number.isFinite(drift) ? round1(drift) : null;
}

/** Pure: the race read against its goal, from the activity, its legs and their streams. */
export function buildRaceAnalysis(input: RaceAnalysisInput): RaceAnalysis {
  const targetSeconds = parseRaceTargetSeconds(input.targetPerformance);
  const totalSeconds =
    input.durationSec ?? input.legs.reduce((sum, { leg }) => sum + leg.durationSec, 0);
  return {
    target: { label: input.targetPerformance?.trim() || null, seconds: targetSeconds },
    total: {
      seconds: totalSeconds,
      deltaSec: targetSeconds === null ? null : totalSeconds - targetSeconds,
    },
    legs: input.legs.map(analyzeLeg),
    runHrDriftPct: runHrDriftPct(input.legs),
    // shortcut: no per-activity recovery estimate exists yet; add it when one does.
    load: { tss: input.load, recoveryHours: null },
  };
}
