import type { MultisportLegKind } from '@sharpit/app/lib/activity/multisport';

/** How a leg's effort held between its first and second half. */
export type RaceLegPacing = {
  unit: 'sec_per_100m' | 'kmh' | 'sec_per_km';
  firstHalf: number;
  secondHalf: number;
  /** Positive = slower in the second half, whatever the unit. */
  changePct: number;
};

export type RaceAnalysisLeg = {
  kind: MultisportLegKind;
  label: string;
  durationSec: number;
  distanceM: number | null;
  /** The row that recorded this leg, to open it; null when the leg has none of its own. */
  sourceActivityId: string | null;
  avgHr: number | null;
  /** Seconds in each of the athlete's 5 HR zones; null without a heart-rate stream. */
  hrZonesSec: number[] | null;
  pacing: RaceLegPacing | null;
};

/** A race read against its goal: total vs target, legs, effort management, load. */
export type RaceAnalysis = {
  target: { label: string | null; seconds: number | null };
  /** `deltaSec` = total − target (negative = faster). */
  total: { seconds: number; deltaSec: number | null };
  legs: RaceAnalysisLeg[];
  /** Aerobic decoupling on the run leg (pace:HR, second half vs first). */
  runHrDriftPct: number | null;
  load: { tss: number | null; recoveryHours: number | null };
};
