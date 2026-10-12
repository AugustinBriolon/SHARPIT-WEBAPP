import { ActivityType } from '@prisma/client';
import { legKindLabel, type MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import { brickGapSec, isValidBrickGap } from '@sharpit/app/lib/goals/goal-triathlon-samples';

/** One stored activity as the detector reads it; `date` is the wall-clock start. */
export type DetectableActivity = {
  id: string;
  type: ActivityType;
  date: Date;
  duration: number | null;
  distanceM: number | null;
  avgHr: number | null;
  garminId: string | null;
};

export type TriathlonChain = {
  /** Every row the race is made of, in order — sport legs and recorded transitions. */
  rows: DetectableActivity[];
  legs: MultisportLeg[];
  start: Date;
  durationSec: number;
};

/** Longest pause between two legs (end of one → start of the next) that still reads as one race. */
export const MAX_LEG_GAP_SEC = 10 * 60;
/** A STRENGTH / OTHER row at most this long between two legs is a recorded transition (T1 / T2). */
export const MAX_TRANSITION_ROW_SEC = 15 * 60;
/** Separate recordings disagree by a few seconds — a slight overlap still chains. */
const MAX_OVERLAP_SEC = 60;

const SPORT_KIND = {
  [ActivityType.SWIM]: 'swim',
  [ActivityType.BIKE]: 'bike',
  [ActivityType.RUN]: 'run',
} as const;

type SportType = keyof typeof SPORT_KIND;

type ChainStep = { row: DetectableActivity; transitionIndex: number | null };

function isTransitionRow(activity: DetectableActivity): boolean {
  return (
    (activity.type === ActivityType.STRENGTH || activity.type === ActivityType.OTHER) &&
    activity.duration !== null &&
    activity.duration <= MAX_TRANSITION_ROW_SEC
  );
}

function follows(prev: DetectableActivity, next: DetectableActivity): boolean {
  const gap = brickGapSec(prev, next);
  return gap >= -MAX_OVERLAP_SEC && gap <= MAX_LEG_GAP_SEC;
}

/** Next row starting after `prev` ends — concurrent rows (another provider's copy) are skipped. */
function nextIndexAfter(sorted: DetectableActivity[], from: number, prev: DetectableActivity) {
  let index = from;
  while (index < sorted.length && brickGapSec(prev, sorted[index]!) < -MAX_OVERLAP_SEC) {
    index += 1;
  }
  return index;
}

function chainFrom(sorted: DetectableActivity[], swimIndex: number): ChainStep[] | null {
  const steps: ChainStep[] = [{ row: sorted[swimIndex]!, transitionIndex: null }];
  let index = swimIndex + 1;
  for (const [transitionIndex, sport] of [
    [1, ActivityType.BIKE],
    [2, ActivityType.RUN],
  ] as const) {
    let prev = steps[steps.length - 1]!.row;
    index = nextIndexAfter(sorted, index, prev);
    const maybeTransition = sorted[index];
    if (maybeTransition && isTransitionRow(maybeTransition) && follows(prev, maybeTransition)) {
      steps.push({ row: maybeTransition, transitionIndex });
      prev = maybeTransition;
      index = nextIndexAfter(sorted, index + 1, prev);
    }
    const leg = sorted[index];
    if (!leg || leg.type !== sport || !follows(prev, leg)) {
      return null;
    }
    steps.push({ row: leg, transitionIndex: null });
    index += 1;
  }
  return steps;
}

function legFromRow(step: ChainStep): MultisportLeg {
  const { row, transitionIndex } = step;
  const kind = transitionIndex === null ? SPORT_KIND[row.type as SportType] : 'transition';
  const durationSec = row.duration ?? 0;
  return {
    kind,
    label: legKindLabel(kind, transitionIndex),
    durationSec,
    movingDurationSec: null,
    distanceM: row.distanceM,
    avgHr: row.avgHr,
    avgSpeedMs: row.distanceM && durationSec > 0 ? row.distanceM / durationSec : null,
    elevationM: null,
    calories: null,
    garminActivityId: row.garminId,
    transitionIndex,
    sourceActivityId: row.id,
  };
}

/** A transition nobody recorded: the pause between two legs, when it looks like one. */
function gapTransition(gapSec: number, transitionIndex: number): MultisportLeg | null {
  if (!isValidBrickGap(gapSec)) {
    return null;
  }
  return {
    kind: 'transition',
    label: legKindLabel('transition', transitionIndex),
    durationSec: gapSec,
    movingDurationSec: null,
    distanceM: null,
    avgHr: null,
    avgSpeedMs: null,
    elevationM: null,
    calories: null,
    garminActivityId: null,
    transitionIndex,
    sourceActivityId: null,
  };
}

function buildLegs(steps: ChainStep[]): MultisportLeg[] {
  const legs: MultisportLeg[] = [];
  let sportCount = 0;
  steps.forEach((step, i) => {
    const prev = steps[i - 1];
    const sportFollowsSport =
      prev && prev.transitionIndex === null && step.transitionIndex === null;
    if (sportFollowsSport) {
      const synthetic = gapTransition(brickGapSec(prev.row, step.row), sportCount);
      if (synthetic) {
        legs.push(synthetic);
      }
    }
    if (step.transitionIndex === null) {
      sportCount += 1;
    }
    legs.push(legFromRow(step));
  });
  return legs;
}

function endMs(activity: DetectableActivity): number {
  return activity.date.getTime() + (activity.duration ?? 0) * 1000;
}

/**
 * Swim → [T1] → bike → [T2] → run on one day, each leg starting within
 * `MAX_LEG_GAP_SEC` of the previous one's end. Transitions are a short STRENGTH / OTHER
 * row (how Strava receives a watch's T1 / T2) or a plain gap. Null when no such chain.
 */
export function detectTriathlonChain(
  dayActivities: readonly DetectableActivity[],
): TriathlonChain | null {
  const sorted = dayActivities
    .filter((activity) => activity.type !== ActivityType.TRIATHLON)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i]!.type !== ActivityType.SWIM) {
      continue;
    }
    const steps = chainFrom(sorted, i);
    if (steps) {
      const rows = steps.map((step) => step.row);
      const start = rows[0]!.date;
      return {
        rows,
        legs: buildLegs(steps),
        start,
        durationSec: Math.round((endMs(rows[rows.length - 1]!) - start.getTime()) / 1000),
      };
    }
  }
  return null;
}
