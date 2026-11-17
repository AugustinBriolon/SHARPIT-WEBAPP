/**
 * Deterministic prescribed-vs-realized comparison for strength sessions.
 *
 * Execution speed is not a strength variable: rest length, watch start/stop and
 * set-up time move recorded duration by tens of minutes for identical work. So
 * compliance is measured on the work itself — which exercises were done, and how
 * much volume — and this score is the floor the AI verdict may not go under.
 */
import { parseExercisePhrase } from '@sharpit/app/lib/exercises/lexicon';
import { isSet } from '@sharpit/shared/value';
import type { SessionAnalysis } from '@sharpit/app/lib/validators/coach';
import { normalizeExerciseKey } from '@sharpit/app/lib/exercises/normalize';

export type ComparableStrengthSet = {
  exercise: string;
  sets: number;
  reps: number;
  durationSec?: number | null;
};

export type StrengthCompliance = {
  prescribedCount: number;
  realizedCount: number;
  matchedCount: number;
  /** Prescribed exercises with no realized counterpart. */
  missing: string[];
  /** Realized exercises that were not prescribed. */
  extra: string[];
  /** Mean realized/prescribed volume over matched exercises, capped at 1. */
  volumeRatio: number;
  /** 0-100, exercise coverage weighted with volume. */
  score: number;
};

/** Seconds of work a rep is worth, so timed and counted sets share a unit. */
const SECONDS_PER_REP = 3;
/** Concept overlap above which two labels describe the same movement. */
const MATCH_THRESHOLD = 0.5;

const WEIGHT_COVERAGE = 0.7;
const WEIGHT_VOLUME = 0.3;

function workUnits(set: ComparableStrengthSet): number {
  const perSet =
    isSet(set.durationSec) && set.durationSec > 0
      ? set.durationSec
      : Math.max(1, set.reps) * SECONDS_PER_REP;
  return Math.max(1, set.sets) * perSet;
}

function similarity(a: string, b: string): number {
  if (normalizeExerciseKey(a) === normalizeExerciseKey(b)) {
    return 1;
  }
  const left = new Set(parseExercisePhrase(a).concepts);
  const right = new Set(parseExercisePhrase(b).concepts);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const concept of left) {
    if (right.has(concept)) {
      shared += 1;
    }
  }
  return shared / Math.min(left.size, right.size);
}

function findBestRealizedMatch(
  plannedSet: ComparableStrengthSet,
  availableRealized: Array<{ set: ComparableStrengthSet; index: number }>,
  usedRealized: Set<number>,
): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null;
  for (const candidate of availableRealized) {
    if (usedRealized.has(candidate.index)) {
      continue;
    }
    const score = similarity(plannedSet.exercise, candidate.set.exercise);
    if (score < MATCH_THRESHOLD) {
      continue;
    }
    if (!best || score > best.score) {
      best = { index: candidate.index, score };
    }
  }
  return best;
}

/**
 * Compare a prescription with what the athlete actually logged.
 * Returns null when either side is empty — nothing to measure, and a missing
 * realized log must never read as a failed session.
 */
export function computeStrengthCompliance(
  prescribed: readonly ComparableStrengthSet[],
  realized: readonly ComparableStrengthSet[],
): StrengthCompliance | null {
  if (prescribed.length === 0 || realized.length === 0) {
    return null;
  }

  const availableRealized = realized.map((set, index) => ({ set, index }));
  const usedRealized = new Set<number>();
  const missing: string[] = [];
  const volumeRatios: number[] = [];

  for (const plannedSet of prescribed) {
    const best = findBestRealizedMatch(plannedSet, availableRealized, usedRealized);

    if (!best) {
      missing.push(plannedSet.exercise);
      continue;
    }
    usedRealized.add(best.index);
    const done = realized[best.index];
    volumeRatios.push(Math.min(1, workUnits(done) / workUnits(plannedSet)));
  }

  const matchedCount = prescribed.length - missing.length;
  const extra = realized.filter((_, index) => !usedRealized.has(index)).map((set) => set.exercise);

  const coverage = matchedCount / prescribed.length;
  const volumeRatio =
    volumeRatios.length > 0
      ? volumeRatios.reduce((sum, ratio) => sum + ratio, 0) / volumeRatios.length
      : 0;

  return {
    prescribedCount: prescribed.length,
    realizedCount: realized.length,
    matchedCount,
    missing,
    extra,
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    score: Math.round(100 * (WEIGHT_COVERAGE * coverage + WEIGHT_VOLUME * volumeRatio)),
  };
}

/** Prompt-ready statement of the structural comparison. */
export function formatStrengthCompliance(compliance: StrengthCompliance): string {
  const lines = [
    `Exercices prévus réalisés : ${compliance.matchedCount}/${compliance.prescribedCount}`,
    `Volume moyen réalisé/prévu sur ces exercices : ${Math.round(compliance.volumeRatio * 100)} %`,
    `Score structurel de conformité (contenu seul, hors durée) : ${compliance.score}/100`,
  ];
  if (compliance.missing.length > 0) {
    lines.push(`Non retrouvés dans le réalisé : ${compliance.missing.join(', ')}`);
  }
  if (compliance.extra.length > 0) {
    lines.push(`En plus du prévu : ${compliance.extra.join(', ')}`);
  }
  return lines.join('\n');
}

/** Above this, a rewritten duration verdict reads as compliant rather than different. */
const AS_PLANNED_SCORE = 80;

/**
 * Duration-driven verdicts are meaningless for strength, and the structural score
 * is a floor: the model may judge a session better than the numbers, never worse.
 */
export function applyStrengthScoringGuards(
  analysis: SessionAnalysis,
  type: string,
  compliance: StrengthCompliance | null,
): SessionAnalysis {
  if (type !== 'STRENGTH') {
    return analysis;
  }

  const complianceScore = isSet(compliance)
    ? Math.max(analysis.complianceScore, compliance.score)
    : analysis.complianceScore;

  const isDurationVerdict = analysis.verdict === 'SHORTER' || analysis.verdict === 'LONGER';
  // « Différent » beside 98/100 contradicts itself: the score, floored by the content, wins.
  const contradictsScore = analysis.verdict === 'DIFFERENT' && complianceScore >= AS_PLANNED_SCORE;
  const replacement = complianceScore >= AS_PLANNED_SCORE ? 'AS_PLANNED' : 'DIFFERENT';

  return {
    ...analysis,
    complianceScore,
    verdict: isDurationVerdict || contradictsScore ? replacement : analysis.verdict,
  };
}
