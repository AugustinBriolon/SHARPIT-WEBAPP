/**
 * Decision-native scenario comparison — no product scoring model.
 *
 * Ordering uses Decision Engine outputs only (lexicographic).
 * @see docs/product/SCENARIO_ENGINE.md
 */

import { formatJours } from '@sharpit/shared/french-plural';
import type { ScenarioDecisionDelta, ScenarioDecisionSnapshot } from '@sharpit/core/scenario/types';
import { verdictRiskRank } from '@sharpit/server/lib/scenario/decision-snapshot';

/** Public comparison contract — no hidden weights. */
export const COMPARISON_METHOD =
  'Lexicographic on Decision Engine outputs: worstVerdict → endVerdict → expectedBenefit → confidence → limitingFactor.priority → riskDayCount';

type CompareResult = -1 | 0 | 1;

function sign(n: number): CompareResult {
  if (n > 0) {
    return 1;
  }
  if (n < 0) {
    return -1;
  }
  return 0;
}

function worstVerdictImproved(
  candidate: ScenarioDecisionSnapshot,
  baseline: ScenarioDecisionSnapshot,
): boolean | null {
  if (verdictRiskRank(candidate.worstVerdict) < verdictRiskRank(baseline.worstVerdict)) {
    return true;
  }
  if (verdictRiskRank(candidate.worstVerdict) > verdictRiskRank(baseline.worstVerdict)) {
    return false;
  }
  return null;
}

/**
 * Compare candidate vs baseline using Decision Engine fields only.
 * Returns 1 if candidate is strictly preferable, -1 if worse, 0 if tie.
 */
export function compareDecisionSnapshots(
  candidate: ScenarioDecisionSnapshot,
  baseline: ScenarioDecisionSnapshot,
): CompareResult {
  const steps = [
    sign(verdictRiskRank(baseline.worstVerdict) - verdictRiskRank(candidate.worstVerdict)),
    sign(verdictRiskRank(baseline.endVerdict) - verdictRiskRank(candidate.endVerdict)),
    sign(candidate.endExpectedBenefit - baseline.endExpectedBenefit),
    sign(candidate.endConfidence - baseline.endConfidence),
    sign(baseline.endLimitingFactorPriority - candidate.endLimitingFactorPriority),
    sign(baseline.riskDayCount - candidate.riskDayCount),
  ];

  for (const step of steps) {
    if (step !== 0) {
      return step;
    }
  }
  return 0;
}

export function computeDecisionDelta(
  candidate: ScenarioDecisionSnapshot,
  baseline: ScenarioDecisionSnapshot,
): ScenarioDecisionDelta {
  const endVerdictChanged = candidate.endVerdict !== baseline.endVerdict;
  const endVerdictCompare = compareDecisionSnapshots(
    { ...candidate, worstVerdict: candidate.endVerdict },
    { ...baseline, worstVerdict: baseline.endVerdict },
  );

  const worstCompare = worstVerdictImproved(candidate, baseline);

  return {
    endVerdictChanged,
    endVerdictImproved: endVerdictChanged ? endVerdictCompare > 0 : null,
    endConfidenceDelta: Math.round((candidate.endConfidence - baseline.endConfidence) * 100) / 100,
    endExpectedBenefitDelta:
      Math.round((candidate.endExpectedBenefit - baseline.endExpectedBenefit) * 100) / 100,
    endLimitingFactorDomainChanged:
      candidate.endLimitingFactorDomain !== baseline.endLimitingFactorDomain,
    worstVerdictImproved: worstCompare,
    riskDayCountDelta: candidate.riskDayCount - baseline.riskDayCount,
  };
}

const VERDICT_LABELS: Record<string, string> = {
  TRAIN_HARD: 'Entraînement intense',
  TRAIN_SMART: 'Entraînement malin',
  TRAIN_EASY: 'Entraînement facile',
  RECOVER: 'Récupération',
  CAUTION: 'Prudence',
  RACE_READY: 'Pic de forme',
  INSUFFICIENT_DATA: 'Données insuffisantes',
};

function verdictLabel(verdict: string): string {
  return VERDICT_LABELS[verdict] ?? verdict;
}

function preferabilityParts(
  delta: ScenarioDecisionDelta,
  candidate: ScenarioDecisionSnapshot,
  baseline: ScenarioDecisionSnapshot,
): string[] {
  const parts: string[] = [];
  if (delta.worstVerdictImproved === true) {
    parts.push(
      `verdict le plus défavorable amélioré (${verdictLabel(baseline.worstVerdict)} → ${verdictLabel(candidate.worstVerdict)})`,
    );
  }
  if (delta.endVerdictImproved === true) {
    parts.push(
      `verdict de fin d’horizon plus favorable (${verdictLabel(baseline.endVerdict)} → ${verdictLabel(candidate.endVerdict)})`,
    );
  }
  if (delta.endExpectedBenefitDelta > 0) {
    parts.push(`bénéfice attendu Decision Engine +${delta.endExpectedBenefitDelta}`);
  }
  if (delta.endConfidenceDelta > 0.02) {
    parts.push(`confiance +${Math.round(delta.endConfidenceDelta * 100)} pts`);
  }
  if (delta.riskDayCountDelta < 0) {
    parts.push(`${formatJours(Math.abs(delta.riskDayCountDelta))} à risque en moins`);
  }
  if (delta.endLimitingFactorDomainChanged && candidate.endLimitingFactorDomain) {
    parts.push(`facteur limitant déplacé vers ${candidate.endLimitingFactorDomain}`);
  }
  return parts;
}

export function buildPreferabilityExplanation(
  delta: ScenarioDecisionDelta,
  candidate: ScenarioDecisionSnapshot,
  baseline: ScenarioDecisionSnapshot,
): string {
  const parts = preferabilityParts(delta, candidate, baseline);
  if (parts.length === 0) {
    if (compareDecisionSnapshots(candidate, baseline) < 0) {
      return 'Moins favorable que le plan actuel selon les sorties Decision Engine.';
    }
    return 'Équivalent au plan actuel sur les sorties Decision Engine comparées.';
  }
  return parts.join(' · ');
}

export function buildDecisionTradeOffs(delta: ScenarioDecisionDelta): string[] {
  const lines: string[] = [];

  if (delta.endExpectedBenefitDelta < 0) {
    lines.push(`Bénéfice attendu Decision Engine ${delta.endExpectedBenefitDelta}`);
  }
  if (delta.endConfidenceDelta < -0.02) {
    lines.push(
      `Confiance ${delta.endConfidenceDelta > 0 ? '+' : ''}${Math.round(delta.endConfidenceDelta * 100)} pts`,
    );
  }
  if (delta.riskDayCountDelta > 0) {
    const extra = delta.riskDayCountDelta > 1 ? 'supplémentaires' : 'supplémentaire';
    lines.push(`${formatJours(delta.riskDayCountDelta)} à risque ${extra}`);
  }
  if (delta.endVerdictImproved === false) {
    lines.push('Verdict de fin d’horizon moins favorable');
  }
  if (delta.worstVerdictImproved === false) {
    lines.push('Pire journée de l’horizon plus risquée');
  }

  return lines;
}
