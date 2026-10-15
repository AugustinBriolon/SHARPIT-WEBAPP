/**
 * Scenario Comparison — presentation mapping + coach formatting.
 */

import type {
  ScenarioComparisonRow,
  ScenarioComparisonViewModel,
} from '@sharpit/app/presentation/scenario-comparison-view-model';
import type { ScenarioComparison } from '@sharpit/core/scenario/types';
import { isSet } from '@sharpit/shared/value';
import type { ProjectionHorizonDays } from '@sharpit/core/projection/types';
import { limitingFactorLabel } from '@sharpit/server/lib/projection/project-athlete-state';
import { runScenarioComparison } from '@sharpit/server/lib/scenario/scenario-engine';
import { mapVerdictToDisplay } from '@sharpit/app/lib/today/dashboard/today-mapping';

const ENV_LABELS: Record<string, string> = {
  NONE: 'Faible',
  MODERATE: 'Modéré',
  SIGNIFICANT: 'Significatif',
};

const DOMAIN_LABELS: Record<string, string> = {
  ENVIRONMENT: 'Environnement',
  RECOVERY: 'Récupération',
  FATIGUE: 'Fatigue',
  ADAPTATION: 'Adaptation',
  PHYSICAL_HEALTH: 'Santé physique',
  PLANNING: 'Planification',
};

const GENERIC_EQUIVALENT = 'Équivalent au plan actuel sur les sorties Decision Engine comparées.';

function confidenceLabel(confidence: number): string | null {
  if (confidence >= 0.75) {
    return 'Élevée';
  }
  if (confidence >= 0.55) {
    return 'Modérée';
  }
  return 'Partielle';
}

function formatScore(value: number | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return String(Math.round(value));
}

export function isGenericEquivalentExplanation(text: string): boolean {
  return text === GENERIC_EQUIVALENT || text.startsWith('Équivalent au plan actuel');
}

function cleanRationale(rationale: string): string {
  return rationale.replace(/^Facteur limitant\s*:[^.]+\.\s*/i, '').trim();
}

const PREFERABILITY_CLAUSE_HANDLERS: Array<{
  match: (clause: string) => boolean;
  format: (clause: string) => string | null;
}> = [
  {
    match: (clause) => clause.startsWith('verdict de fin'),
    format: () => "améliore le verdict en fin d'horizon",
  },
  {
    match: (clause) => clause.startsWith('verdict le plus défavorable'),
    format: () => "réduit le jour le plus risqué de l'horizon",
  },
  {
    match: (clause) => clause.startsWith('bénéfice attendu'),
    format: () => 'renforce le bénéfice attendu sur la période',
  },
  {
    match: (clause) => clause.startsWith('confiance'),
    format: () => 'gagne en confiance sur la projection',
  },
  {
    match: (clause) => /jours? à risque en moins/.test(clause),
    format: (clause) => {
      const n = clause.match(/(\d+)/)?.[1];
      return n
        ? `${n} jour${n === '1' ? '' : 's'} de vigilance en moins`
        : 'moins de jours à risque';
    },
  },
  {
    match: (clause) => clause.startsWith('facteur limitant déplacé'),
    format: () => 'déplace le facteur limitant',
  },
];

function humanizePreferabilityClause(clause: string): string | null {
  for (const handler of PREFERABILITY_CLAUSE_HANDLERS) {
    if (handler.match(clause)) {
      return handler.format(clause);
    }
  }
  return null;
}

function humanizePreferability(text: string): string | null {
  const clauses = text.split(' · ').map(humanizePreferabilityClause).filter(Boolean);
  if (clauses.length === 0) {
    return null;
  }
  const sentence = clauses.join(', ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

function buildBaselineSummaryLine(): string {
  return 'Référence — ton planning tel quel, pour comparer les autres options.';
}

function buildRecommendedSummaryLine(action: string, pref: string): string {
  const equivalent = isGenericEquivalentExplanation(pref);
  if (!equivalent) {
    const benefit = humanizePreferability(pref);
    return benefit ? `${action} ${benefit}` : `${action} Option préférée sur cet horizon.`;
  }
  return `${action} Meilleur compromis identifié, même si l'écart reste faible.`;
}

function buildAlternativeSummaryLine(
  action: string,
  pref: string,
  allAlternativesEquivalent: boolean,
): string {
  const equivalent = isGenericEquivalentExplanation(pref);
  if (equivalent) {
    return allAlternativesEquivalent
      ? action
      : `${action} Pas d'avantage net par rapport au plan actuel.`;
  }
  if (pref.includes('Moins favorable')) {
    return `${action} Moins intéressante que garder le plan actuel.`;
  }
  const nuance = humanizePreferability(pref);
  return nuance ? `${action} ${nuance}` : action;
}

function buildSummaryLine(input: {
  rationale: string;
  preferabilityExplanation: string;
  isRecommended: boolean;
  isBaseline: boolean;
  allAlternativesEquivalent: boolean;
}): string {
  const action = cleanRationale(input.rationale);

  if (input.isBaseline) {
    return buildBaselineSummaryLine();
  }

  if (input.isRecommended) {
    return buildRecommendedSummaryLine(action, input.preferabilityExplanation);
  }

  return buildAlternativeSummaryLine(
    action,
    input.preferabilityExplanation,
    input.allAlternativesEquivalent,
  );
}

function scenarioLimitingFactor(entry: ScenarioComparison['scenarios'][number]): string | null {
  const lastDay = entry.projection.days[entry.projection.days.length - 1];
  if (lastDay === undefined || lastDay === null) {
    return null;
  }
  return (
    limitingFactorLabel(lastDay.decision.limitingFactor) ??
    (entry.decision.endLimitingFactorDomain
      ? (DOMAIN_LABELS[entry.decision.endLimitingFactorDomain] ??
        entry.decision.endLimitingFactorDomain)
      : null)
  );
}

function scenarioPreferabilityExplanation(
  entry: ScenarioComparison['scenarios'][number],
): string | null {
  if (
    entry.kind === 'KEEP_PLAN' ||
    isGenericEquivalentExplanation(entry.preferabilityExplanation)
  ) {
    return null;
  }
  return entry.preferabilityExplanation;
}

function buildScenarioRow(
  entry: ScenarioComparison['scenarios'][number],
  comparison: ScenarioComparison,
  allAlternativesEquivalent: boolean,
): ScenarioComparisonRow {
  const isRecommended = entry.scenarioId === comparison.recommendedScenarioId;
  const isBaseline = entry.kind === 'KEEP_PLAN';

  return {
    scenarioId: entry.scenarioId,
    kind: entry.kind,
    label: entry.label,
    summaryLine: buildSummaryLine({
      rationale: entry.rationale,
      preferabilityExplanation: entry.preferabilityExplanation,
      isRecommended,
      isBaseline,
      allAlternativesEquivalent,
    }),
    isRecommended,
    isBaseline,
    targetSessionId: entry.targetSessionId,
    canApply: entry.kind !== 'KEEP_PLAN' && isSet(entry.targetSessionId),
    technicalDetail: {
      endVerdict: mapVerdictToDisplay(entry.decision.endVerdict).label,
      endReadiness: formatScore(entry.outcome.endReadiness),
      endAdaptation: formatScore(entry.outcome.endAdaptation),
      environmentalImpact: ENV_LABELS[entry.outcome.maxEnvironmentalImpact] ?? '—',
      endConfidenceLabel: confidenceLabel(entry.decision.endConfidence),
      limitingFactor: scenarioLimitingFactor(entry),
      preferabilityExplanation: scenarioPreferabilityExplanation(entry),
      tradeOffs: entry.tradeOffs,
    },
  };
}

function emptyScenarioComparisonViewModel(): ScenarioComparisonViewModel {
  return {
    visible: false,
    horizonDays: 7,
    recommendedScenarioId: null,
    recommendedScenarioLabel: null,
    focusSessionLabel: null,
    anchorDecisionDomain: null,
    recommendation: '',
    recommendationRationale: '',
    sharedEquivalentNote: null,
    scenarios: [],
    emptyStateMessage:
      'Planifie au moins une séance future pour comparer des scénarios automatiques.',
  };
}

function coachComparisonHeaderLines(comparison: ScenarioComparison): string[] {
  const lines: string[] = [];
  lines.push('## Comparaison de scénarios (Scenario Engine — orchestration)');
  if (comparison.focusSessionLabel) {
    lines.push(`Séance analysée : ${comparison.focusSessionLabel}.`);
  }
  if (comparison.anchorDecisionDomain) {
    lines.push(
      `Facteur limitant du jour (Decision Engine) : ${DOMAIN_LABELS[comparison.anchorDecisionDomain] ?? comparison.anchorDecisionDomain}.`,
    );
  }
  lines.push(`Recommandation : ${comparison.recommendation}`);
  lines.push(comparison.recommendationRationale);
  return lines;
}

function coachScenarioDetailLines(
  entry: ScenarioComparison['scenarios'][number],
  recommendedScenarioId: string,
): string[] {
  const d = entry.decision;
  const marker = coachScenarioMarker(entry, recommendedScenarioId);
  const lines = [
    `${marker}${entry.label} · verdict ${d.endVerdict} · confiance ${Math.round(d.endConfidence * 100)}% · benefit ${d.endExpectedBenefit}`,
  ];
  if (entry.preferabilityExplanation && entry.kind !== 'KEEP_PLAN') {
    lines.push(`  Pourquoi : ${entry.preferabilityExplanation}`);
  }
  if (entry.tradeOffs.length) {
    lines.push(`  Compromis : ${entry.tradeOffs.join(' · ')}`);
  }
  return lines;
}

function populatedScenarioComparisonViewModel(
  comparison: ScenarioComparison,
  scenarios: ScenarioComparisonRow[],
  allAlternativesEquivalent: boolean,
): ScenarioComparisonViewModel {
  const hasActionableRecommendation =
    comparison.recommendedScenarioId !== comparison.baselineScenarioId;
  const recommendedScenario = scenarios.find((s) => s.isRecommended);

  return {
    visible: hasActionableRecommendation,
    horizonDays: comparison.horizonDays,
    recommendedScenarioId: hasActionableRecommendation ? comparison.recommendedScenarioId : null,
    recommendedScenarioLabel: recommendedScenario?.label ?? null,
    focusSessionLabel: comparison.focusSessionLabel,
    anchorDecisionDomain: comparison.anchorDecisionDomain
      ? (DOMAIN_LABELS[comparison.anchorDecisionDomain] ?? comparison.anchorDecisionDomain)
      : null,
    recommendation: comparison.recommendation,
    recommendationRationale: comparison.recommendationRationale,
    sharedEquivalentNote: allAlternativesEquivalent
      ? 'Sur cet horizon, les alternatives testées équivalent au plan actuel — aucun avantage net détecté.'
      : null,
    scenarios,
    emptyStateMessage: null,
  };
}

export function buildScenarioComparisonViewModel(
  comparison: ScenarioComparison | null,
): ScenarioComparisonViewModel {
  if (!comparison || comparison.scenarios.length === 0) {
    return emptyScenarioComparisonViewModel();
  }

  const nonBaseline = comparison.scenarios.filter((e) => e.kind !== 'KEEP_PLAN');
  const allAlternativesEquivalent =
    nonBaseline.length > 0 &&
    nonBaseline.every((e) => isGenericEquivalentExplanation(e.preferabilityExplanation));

  const scenarios = comparison.scenarios.map((entry) =>
    buildScenarioRow(entry, comparison, allAlternativesEquivalent),
  );

  return populatedScenarioComparisonViewModel(comparison, scenarios, allAlternativesEquivalent);
}

export async function buildScenarioComparisonPresentationViewModel(
  athleteId: string,
  params?: {
    horizonDays?: ProjectionHorizonDays;
    anchorTrainingDayId?: string;
  },
): Promise<ScenarioComparisonViewModel> {
  const comparison = await runScenarioComparison(athleteId, params);
  return buildScenarioComparisonViewModel(comparison);
}

/** Compact markdown for Coach prompt injection. */
function coachScenarioMarker(
  entry: ScenarioComparison['scenarios'][number],
  recommendedScenarioId: string,
): string {
  if (entry.scenarioId === recommendedScenarioId) {
    return '★ ';
  }
  if (entry.kind === 'KEEP_PLAN') {
    return '● ';
  }
  return '- ';
}

export function formatScenarioComparisonForCoach(
  comparison: ScenarioComparison | null,
): string | null {
  if (!comparison || comparison.scenarios.length <= 1) {
    return null;
  }

  const lines = coachComparisonHeaderLines(comparison);
  for (const entry of comparison.scenarios) {
    lines.push(...coachScenarioDetailLines(entry, comparison.recommendedScenarioId));
  }

  lines.push(
    'Le Scenario Engine explore des futurs — le Decision Engine arbitre. Explique sans contredire la décision du jour.',
  );

  return lines.join('\n');
}

export async function loadScenarioComparisonForCoach(
  athleteId: string,
  params?: {
    horizonDays?: ProjectionHorizonDays;
  },
): Promise<ScenarioComparison | null> {
  return runScenarioComparison(athleteId, { horizonDays: params?.horizonDays ?? 7 });
}
