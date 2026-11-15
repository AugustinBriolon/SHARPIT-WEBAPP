/**
 * FATIGUE MODEL v1 — Scoring Functions
 *
 * Implements the five-dimension fatigue scoring algorithm from
 * FATIGUE_MODEL.md §4.2–4.7.
 *
 * All functions are pure (no side effects, no I/O).
 * Inputs follow the PENDING convention from the Feature Layer.
 *
 * Dimension weights (per spec):
 *   Load              0.30
 *   Neuromuscular     0.25
 *   Metabolic         0.20
 *   Cumulative        0.15
 *   Psychological     0.10
 */

import type {
  DimensionScore,
  ScoredFatigueDimensions,
  FatigueLevel,
  FatigueType,
  FatigueDominantDimension,
  FatigueTrajectory,
  TrainingCapacity,
  DataCompleteness,
} from './types';
import type { LoadFeatureSet, RecoveryFeatureSet, SessionFeatureSet } from '../../features/types';
import { TSS_METHOD_CONFIDENCE } from '../../features/types';
import { isSet } from '@sharpit/shared/value';
import type { SubjectiveWellnessComponents } from '../../features/types';
import type { RecoveryState } from '../../digital-twin/types';
import type { SportType } from '../../observation/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants (per FATIGUE_MODEL.md and ADR-001)
// ─────────────────────────────────────────────────────────────────────────────

const DIMENSION_WEIGHTS = {
  load: 0.3,
  neuromuscular: 0.25,
  metabolic: 0.2,
  cumulative: 0.15,
  psychological: 0.1,
} as const;

/** A dimension at or above this floors the index out of the fresh band. */
const SEVERE_DIMENSION_SCORE = 80;
const SEVERE_DIMENSION_FLOOR = 25;

/** Accumulation threshold: FatigueIndex > this → counts as accumulation day. */
const ACCUMULATION_THRESHOLD = 55;

function accumulationQualityFactor(consecutiveAccumulationDays: number): number {
  if (consecutiveAccumulationDays >= 7) {
    return 0.85;
  }
  if (consecutiveAccumulationDays >= 3) {
    return 0.6;
  }
  return 0.3;
}

function classifyFatigueDataCompleteness(dimensionCount: number): DataCompleteness {
  if (dimensionCount >= 5) {
    return 'FULL';
  }
  if (dimensionCount >= 3) {
    return 'PARTIAL';
  }
  return 'SPARSE';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sport-specific mechanical stress factor (v1 approximation)
// Higher values → more eccentric / mechanical loading per TSS unit
// ─────────────────────────────────────────────────────────────────────────────

const MECHANICAL_STRESS_BY_SPORT: Partial<Record<SportType, number>> = {
  TRAIL_RUN: 1.5,
  RUN: 1.4,
  STRENGTH: 1.3,
  TRIATHLON: 1.0,
  BIKE: 0.8,
  MTB: 0.8,
  SWIM: 0.7,
  OPEN_WATER: 0.7,
};

function getMechanicalStressFactor(sport: SportType): number {
  return MECHANICAL_STRESS_BY_SPORT[sport] ?? 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 1 — Load Fatigue (FATIGUE_MODEL.md §4.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load fatigue by the acute load against the athlete's own chronic load, linear between
 * these points. Training as usual (1.0) is functional fatigue, not accumulation: as
 * `ACWR / 1.5` it scored 67 and sat in the accumulated band every ordinary week.
 */
const ACWR_FATIGUE_KNOTS: ReadonlyArray<readonly [acwr: number, score: number]> = [
  [0, 0],
  [0.8, 25],
  [1.0, 35],
  [1.3, 65],
  [1.5, 90],
  [2.0, 100],
];

function loadFatigueFromAcwr(acwr: number): number {
  const last = ACWR_FATIGUE_KNOTS[ACWR_FATIGUE_KNOTS.length - 1];
  if (acwr >= last[0]) {
    return last[1];
  }
  const upper = ACWR_FATIGUE_KNOTS.findIndex(([knot]) => acwr < knot);
  if (upper <= 0) {
    return 0;
  }
  const [x0, y0] = ACWR_FATIGUE_KNOTS[upper - 1];
  const [x1, y1] = ACWR_FATIGUE_KNOTS[upper];
  return y0 + ((acwr - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Scores load fatigue from ACWR and load monotony (rolling sums, see the load extractor).
 */
export function scoreLoadFatigue(load: LoadFeatureSet | 'PENDING'): DimensionScore {
  if (load === 'PENDING' || load.acwr === undefined || load.acwr === null) {
    return { score: null, available: false, qualityFactor: 0 };
  }

  // Round base before applying multipliers so boundary values are stable
  let score = Math.round(loadFatigueFromAcwr(load.acwr));

  // Monotony amplifier (Foster et al. 1998)
  if (isSet(load.loadMonotony)) {
    if (load.loadMonotony > 2.0) {
      score = Math.round(Math.min(score * 1.1, 100));
    } else if (load.loadMonotony < 1.3) {
      score = Math.round(score * 0.95);
    }
  }

  return {
    score,
    available: true,
    qualityFactor: load.confidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 2 — Neuromuscular Fatigue (FATIGUE_MODEL.md §4.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores neuromuscular fatigue from:
 *   - Central component: autonomic score from Recovery Model (HRV proxy)
 *   - Peripheral component: mechanical load (session sport × TSS) + soreness
 */
function scoreCentralNeuromuscularComponent(recoveryState: RecoveryState | null): {
  component: number | null;
  quality: number;
} {
  if (
    recoveryState?.dimensions.autonomic.available &&
    isSet(recoveryState.dimensions.autonomic.score)
  ) {
    return {
      component: 100 - recoveryState.dimensions.autonomic.score,
      quality: 0.9,
    };
  }
  return { component: null, quality: 0 };
}

function scorePeripheralNeuromuscularComponent(
  recovery: RecoveryFeatureSet | null,
  sessions: readonly SessionFeatureSet[],
): { component: number; quality: number } {
  const recentMechanicalLoad = sessions.reduce((sum, session) => {
    return sum + session.tssScore * getMechanicalStressFactor(session.sportType);
  }, 0);
  const mechanicalComponent = Math.min((recentMechanicalLoad / 150) * 100, 100);
  const perceivedSoreness = recovery?.subjectiveWellnessComponents?.perceivedSoreness ?? null;
  const sorenessComponent = isSet(perceivedSoreness) ? perceivedSoreness * 10 : mechanicalComponent;
  return {
    component: 0.55 * mechanicalComponent + 0.45 * sorenessComponent,
    quality: isSet(perceivedSoreness) ? 0.75 : 0.55,
  };
}

export function scoreNeuromuscularFatigue(
  recovery: RecoveryFeatureSet | 'PENDING' | null,
  recoveryState: RecoveryState | null,
  sessions: readonly SessionFeatureSet[],
): DimensionScore {
  const rf = recovery !== 'PENDING' ? recovery : null;
  const central = scoreCentralNeuromuscularComponent(recoveryState);
  const peripheral = scorePeripheralNeuromuscularComponent(rf, sessions);

  const score = isSet(central.component)
    ? central.component * 0.4 + peripheral.component * 0.6
    : peripheral.component;
  const qualityFactor = isSet(central.component)
    ? central.quality * 0.4 + peripheral.quality * 0.6
    : peripheral.quality;

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    available: true,
    qualityFactor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 3 — Metabolic Fatigue (FATIGUE_MODEL.md §4.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores metabolic fatigue from today's sessions' anaerobic load.
 *
 * v1 simplification: uses only today's sessions (not 48h window).
 * Time decay = 1.0 for all same-day sessions.
 *
 * Formula: MetabolicFatigue = clamp(Σ(anaerobicFactor × TSS) / 100 × 100, 0, 100)
 */
function applyHrDriftModifier(score: number, maxHrDrift: number): number {
  if (maxHrDrift > 15) {
    return Math.min(score * 1.3, 100);
  }
  if (maxHrDrift > 8) {
    return Math.min(score * 1.15, 100);
  }
  return score;
}

export function scoreMetabolicFatigue(sessions: readonly SessionFeatureSet[]): DimensionScore {
  if (sessions.length === 0) {
    return { score: 0, available: true, qualityFactor: 0.5 };
  }

  let totalMetabolicStress = 0;
  let maxHrDrift = 0;
  let sumMethodConfidence = 0;

  for (const session of sessions) {
    const anaerobicFactor = session.anaerobicLoadFactor ?? 0.3;
    totalMetabolicStress += anaerobicFactor * session.tssScore;
    if (isSet(session.hrDriftPercent) && session.hrDriftPercent > maxHrDrift) {
      maxHrDrift = session.hrDriftPercent;
    }
    sumMethodConfidence += TSS_METHOD_CONFIDENCE[session.tssMethod] ?? 0.4;
  }

  const baseScore = Math.max(Math.min((totalMetabolicStress / 100) * 100, 100), 0);
  const score = applyHrDriftModifier(baseScore, maxHrDrift);

  return {
    score: Math.round(score),
    available: true,
    qualityFactor: sumMethodConfidence / sessions.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 4 — Cumulative Trajectory (FATIGUE_MODEL.md §4.5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores cumulative trajectory from:
 *   - Consecutive accumulation days (momentum)
 *   - Sleep debt (impairs fatigue clearance)
 *   - Objective/subjective dissonance (motivated-athlete failure mode guard)
 */
export function scoreCumulativeTrajectory(
  consecutiveAccumulationDays: number,
  sleepDebtMin: number | null,
  dissonanceDetected: boolean,
): DimensionScore {
  // Accumulation pressure: 7 pts/day, capped at 70
  const accumulationPressure = Math.min(consecutiveAccumulationDays * 7, 70);

  // Sleep debt: 480 min (8h) → full 30 pt contribution
  const sleepDebtContribution = isSet(sleepDebtMin) ? Math.min((sleepDebtMin / 480) * 30, 30) : 0;

  // Dissonance penalty: objective/subjective split during accumulation
  const dissonancePenalty = dissonanceDetected && consecutiveAccumulationDays > 3 ? 10 : 0;

  const score = Math.min(accumulationPressure + sleepDebtContribution + dissonancePenalty, 100);

  const hasData = isSet(sleepDebtMin) || consecutiveAccumulationDays > 0;
  const qualityFactor = accumulationQualityFactor(consecutiveAccumulationDays);

  return {
    score: Math.round(score),
    available: hasData,
    qualityFactor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 5 — Psychological Fatigue (FATIGUE_MODEL.md §4.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores psychological/motivational fatigue from subjective wellness.
 *
 * Formula: PsychFatigue = 100 − (mood × 20 + energyLevel × 20) / 2, on 1–5 answers
 *   both at 1 → 80 (severe)
 *   both at 5 → 0 (none), as with a single answer
 */
function scoreFromMoodAndEnergy(mood: number | null, energyLevel: number | null): number | null {
  if (isSet(mood) && isSet(energyLevel)) {
    return 100 - (mood * 20 + energyLevel * 20) / 2;
  }
  if (isSet(mood)) {
    return 100 - mood * 20;
  }
  if (isSet(energyLevel)) {
    return 100 - energyLevel * 20;
  }
  return null;
}

function readWellnessComponents(
  recovery: RecoveryFeatureSet | 'PENDING' | null,
): SubjectiveWellnessComponents | null {
  if (recovery === 'PENDING' || !recovery) {
    return null;
  }
  return recovery.subjectiveWellnessComponents ?? null;
}

export function scorePsychologicalFatigue(
  recovery: RecoveryFeatureSet | 'PENDING' | null,
): DimensionScore {
  const components = readWellnessComponents(recovery);
  const score = scoreFromMoodAndEnergy(components?.mood ?? null, components?.energyLevel ?? null);

  if (score === undefined || score === null) {
    return { score: null, available: false, qualityFactor: 0 };
  }

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    available: true,
    qualityFactor: 0.8,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthesis — Weighted FatigueIndex (FATIGUE_MODEL.md §4.7)
// ─────────────────────────────────────────────────────────────────────────────

export type SynthesisResult = {
  readonly score: number | null;
  readonly confidence: number;
  readonly dataCompleteness: DataCompleteness;
};

/**
 * Synthesizes the five dimension scores into a single FatigueIndex.
 *
 * Unavailable dimensions have their weight redistributed proportionally
 * to available dimensions (same rule as the Recovery Model).
 *
 * Minimum requirement: at least 2 dimensions must be available.
 */
export function synthesizeFatigueIndex(dims: ScoredFatigueDimensions): SynthesisResult {
  const entries = Object.entries(dims) as Array<[keyof typeof DIMENSION_WEIGHTS, DimensionScore]>;
  const available = entries.filter(([, d]) => d.available && isSet(d.score));

  if (available.length < 2) {
    return { score: null, confidence: 0, dataCompleteness: 'INSUFFICIENT' };
  }

  const totalWeight = available.reduce((sum, [k]) => sum + DIMENSION_WEIGHTS[k], 0);
  const score = available.reduce(
    (sum, [k, d]) => sum + d.score! * (DIMENSION_WEIGHTS[k] / totalWeight),
    0,
  );
  const confidence = available.reduce(
    (sum, [k, d]) => sum + d.qualityFactor * (DIMENSION_WEIGHTS[k] / totalWeight),
    0,
  );

  const n = available.length;
  const dataCompleteness = classifyFatigueDataCompleteness(n);

  // One system at its worst is not a fresh athlete, however light the others weigh.
  const severe = available.some(([, d]) => d.score! >= SEVERE_DIMENSION_SCORE);
  const index = severe ? Math.max(score, SEVERE_DIMENSION_FLOOR) : score;

  return { score: Math.round(index), confidence, dataCompleteness };
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification helpers
// ─────────────────────────────────────────────────────────────────────────────

export function classifyFatigueLevel(index: number | null): FatigueLevel {
  if (index === undefined || index === null) {
    return 'INSUFFICIENT_DATA';
  }
  if (index <= 20) {
    return 'FRESH';
  }
  if (index <= 40) {
    return 'FUNCTIONAL_LOW';
  }
  if (index <= 60) {
    return 'FUNCTIONAL_HIGH';
  }
  if (index <= 75) {
    return 'ACCUMULATED';
  }
  if (index <= 88) {
    return 'NON_FUNCTIONAL_RISK';
  }
  return 'OVERREACHING_RISK';
}

type LabeledFatigueDimension = { name: FatigueDominantDimension; score: number; weight?: number };

function collectLabeledDimensions(
  dims: ScoredFatigueDimensions,
  includeWeights = false,
): LabeledFatigueDimension[] {
  const entries: Array<[FatigueDominantDimension, DimensionScore, number?]> = [
    ['LOAD', dims.load, 0.3],
    ['NEUROMUSCULAR', dims.neuromuscular, 0.25],
    ['METABOLIC', dims.metabolic, 0.2],
    ['CUMULATIVE', dims.cumulative, 0.15],
    ['PSYCHOLOGICAL', dims.psychological, 0.1],
  ];

  return entries.flatMap(([name, dimension, weight]) => {
    if (!dimension.available || dimension.score === undefined || dimension.score === null) {
      return [];
    }
    return includeWeights
      ? [{ name, score: dimension.score, weight }]
      : [{ name, score: dimension.score }];
  });
}

function fatigueTypeForDominant(name: FatigueDominantDimension): FatigueType {
  const typeByDimension: Record<FatigueDominantDimension, FatigueType> = {
    LOAD: 'LOAD_DOMINANT',
    NEUROMUSCULAR: 'NEUROMUSCULAR_DOMINANT',
    METABOLIC: 'METABOLIC_DOMINANT',
    PSYCHOLOGICAL: 'PSYCHOLOGICAL_DOMINANT',
    CUMULATIVE: 'MIXED',
  };
  return typeByDimension[name];
}

function isCumulativeMultiSystem(labeled: LabeledFatigueDimension[]): boolean {
  return labeled.length >= 3 && labeled.every((dimension) => dimension.score > 70);
}

function hasCloseRunnerUp(sorted: LabeledFatigueDimension[]): boolean {
  const [highest, runnerUp] = sorted;
  return Boolean(highest && runnerUp && highest.score - runnerUp.score <= 10);
}

export function classifyFatigueType(dims: ScoredFatigueDimensions): FatigueType {
  const labeled = collectLabeledDimensions(dims);
  if (labeled.length === 0) {
    return 'UNDETERMINED';
  }

  const sorted = [...labeled].sort((a, b) => b.score - a.score);
  const [highest] = sorted;
  if (!highest || highest.score < 40) {
    return 'UNDETERMINED';
  }

  if (isCumulativeMultiSystem(labeled)) {
    return 'CUMULATIVE_MULTI_SYSTEM';
  }

  if (hasCloseRunnerUp(sorted)) {
    return 'MIXED';
  }

  return fatigueTypeForDominant(highest.name);
}

export function getDominantDimension(dims: ScoredFatigueDimensions): FatigueDominantDimension {
  const candidates = collectLabeledDimensions(dims, true) as Array<{
    name: FatigueDominantDimension;
    score: number;
    weight: number;
  }>;

  if (candidates.length === 0) {
    return 'LOAD';
  }

  return [...candidates].sort((a, b) => b.score - a.score || b.weight - a.weight)[0]!.name;
}

const TRAINING_CAPACITY_BY_LEVEL: Record<FatigueLevel, TrainingCapacity> = {
  FRESH: 'FULL',
  INSUFFICIENT_DATA: 'FULL',
  FUNCTIONAL_LOW: 'FULL',
  FUNCTIONAL_HIGH: 'REDUCED',
  ACCUMULATED: 'LIGHT_ONLY',
  NON_FUNCTIONAL_RISK: 'REST_ONLY',
  OVERREACHING_RISK: 'REST_ONLY',
};

export function classifyTrainingCapacity(
  level: FatigueLevel,
  trainingBlockedByCondition: boolean,
): TrainingCapacity {
  if (trainingBlockedByCondition) {
    return 'LIGHT_ONLY';
  }
  return TRAINING_CAPACITY_BY_LEVEL[level];
}

function dimensionRecoveryDays(score: number | null, halfLife: number): number {
  return isSet(score) ? (score / 100) * halfLife : 0;
}

export function estimateTimeToFresh(
  dims: ScoredFatigueDimensions,
  level: FatigueLevel,
): number | null {
  if (level === 'FRESH' || level === 'INSUFFICIENT_DATA') {
    return null;
  }
  if (level === 'OVERREACHING_RISK') {
    return 14;
  }

  const days = Math.ceil(
    Math.max(
      dimensionRecoveryDays(dims.load.score, 5.0),
      dimensionRecoveryDays(dims.neuromuscular.score, 2.5),
      dimensionRecoveryDays(dims.metabolic.score, 1.0),
      dimensionRecoveryDays(dims.cumulative.score, 7.0),
      dimensionRecoveryDays(dims.psychological.score, 2.0),
    ),
  );

  return days > 0 ? days : null;
}

export function computeFatigueTrajectory(history: readonly number[]): FatigueTrajectory {
  if (history.length < 6) {
    return 'STABLE';
  }

  // history is ordered newest-first
  const recent3 = history.slice(0, 3);
  const prior3 = history.slice(3, 6);

  const meanRecent = recent3.reduce((s, v) => s + v, 0) / 3;
  const meanPrior = prior3.reduce((s, v) => s + v, 0) / 3;
  const delta = meanRecent - meanPrior;

  // Meaningful accumulation: average fatigue rose by > 7 points over 3-day blocks
  // (uses > 7 rather than >= 8 to stay robust against floating-point rounding)
  if (delta > 7) {
    // Compute average daily rate of change within recent3 only (newest-first)
    const recentRate = (recent3[0]! - recent3[recent3.length - 1]!) / (recent3.length - 1);
    return recentRate > 3 ? 'ACCELERATING' : 'ACCUMULATING';
  }
  if (delta < -5) {
    return 'RESOLVING';
  }
  return 'STABLE';
}

/**
 * Compute consecutive accumulation days from history.
 * History is ordered most-recent-first. Count from the start until
 * a day below the threshold breaks the streak.
 */
export function computeConsecutiveAccumulationDays(history: readonly number[]): number {
  let count = 0;
  for (const v of history) {
    if (v > ACCUMULATION_THRESHOLD) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Apply the motivated-athlete conservative bias guard (FATIGUE_MODEL.md §9.4).
 * When dissonance has been detected for ≥ 3 days, the psychological dimension counts
 * for half in the confidence. It does not move the index.
 */
export function applyDissonanceBias(
  dims: ScoredFatigueDimensions,
  consecutiveAccumulationDays: number,
  dissonanceDetected: boolean,
): ScoredFatigueDimensions {
  if (!dissonanceDetected || consecutiveAccumulationDays < 3) {
    return dims;
  }

  return {
    ...dims,
    psychological: {
      ...dims.psychological,
      qualityFactor: dims.psychological.qualityFactor * 0.5,
    },
  };
}

/** Share of a session's stress still carried one and two days later. */
const CARRY_OVER_BY_DAYS_AGO: Record<number, number> = { 1: 0.5, 2: 0.25 };

/**
 * Today's sessions plus what the last two days still weigh. Read from the day's own
 * sessions only, the morning after a marathon showed no metabolic or mechanical fatigue.
 */
export function sessionsWithCarryOver(
  today: readonly SessionFeatureSet[],
  prior: ReadonlyArray<{ daysAgo: number; session: SessionFeatureSet }> = [],
): SessionFeatureSet[] {
  const carried = prior.flatMap(({ daysAgo, session }) => {
    const share = CARRY_OVER_BY_DAYS_AGO[daysAgo];
    return share ? [{ ...session, tssScore: session.tssScore * share }] : [];
  });
  return [...today, ...carried];
}
