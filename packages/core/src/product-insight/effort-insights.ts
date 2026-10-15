import { buildProductInsightBundle } from './build-product-insight-bundle';
import { formatJours } from '@sharpit/shared/french-plural';
import { isSet } from '@sharpit/shared/value';
import type { EffortInsightInput, ProductInsight } from './types';

function buildDailyCostInsight(input: EffortInsightInput): ProductInsight {
  return {
    id: 'effort:daily-cost',
    title: 'Coût du jour',
    summary: isSet(input.strainScore)
      ? `${input.strainScore}/21 · ${input.fatigueTypeLabel}`
      : input.fatigueTypeLabel,
    explanation:
      "La lecture utile n'est pas seulement la charge accomplie, mais le type de coût que cette charge impose à ton organisme.",
    evidence: input.rationale,
    confidence: input.confidence,
    importance: 'HIGH',
    decisionImpact: 'TRAINING_TODAY',
    relatedDimensions: ['DAILY_STRAIN', 'FATIGUE'],
  };
}

function buildTrainingCapacityInsight(input: EffortInsightInput): ProductInsight {
  return {
    id: 'effort:training-capacity',
    title: 'Marge de travail restante',
    summary: input.trainingCapacityLabel,
    explanation: isSet(input.performancePercent)
      ? `La capacité utile du jour est estimée autour de ${input.performancePercent} % de ton niveau frais.`
      : 'La capacité traduit ce que le corps peut encore absorber sans payer trop cher ensuite.',
    evidence: [
      isSet(input.estimatedDaysToFresh)
        ? `${formatJours(input.estimatedDaysToFresh)} pour revenir frais`
        : null,
      input.limitingFactorLabel,
    ].filter((line): line is string => Boolean(line)),
    confidence: input.confidence,
    importance: 'HIGH',
    decisionImpact: 'TRAINING_TODAY',
    relatedDimensions: ['FATIGUE'],
  };
}

function buildDominantSystemInsight(input: EffortInsightInput): ProductInsight {
  return {
    id: 'effort:dominant-system',
    title: 'Système qui paie le plus',
    summary: input.dominantDimensionLabel!,
    explanation: isSet(input.limitingFactorLabel)
      ? `Le facteur limitant principal est ${input.limitingFactorLabel.toLowerCase()}.`
      : 'Identifier le système dominant aide à savoir quoi protéger sur la prochaine séance.',
    evidence: input.keyEvidence.slice(0, 3),
    confidence: input.confidence,
    importance: 'MEDIUM',
    decisionImpact: 'LOAD_PROGRESSION',
    relatedDimensions: ['FATIGUE'],
  };
}

function buildLoadContextInsight(input: EffortInsightInput): ProductInsight {
  return {
    id: 'effort:load-context',
    title: 'Contexte de charge',
    summary: `ACWR ${input.acwr > 0 ? input.acwr.toFixed(2) : '—'} · ${input.weeklyLoad} TSS / 7j`,
    explanation:
      'Le contexte hebdomadaire sert surtout à juger si le coût du jour reste soutenable dans le bloc actuel.',
    evidence: [
      isSet(input.tsb) ? `TSB ${input.tsb > 0 ? '+' : ''}${input.tsb}` : null,
      input.overreachingLabel,
    ].filter((line): line is string => Boolean(line)),
    confidence: input.confidence,
    importance: 'MEDIUM',
    decisionImpact: 'LOAD_PROGRESSION',
    relatedDimensions: ['FATIGUE', 'ADAPTATION'],
  };
}

function collectSupportingEffortInsights(input: EffortInsightInput): ProductInsight[] {
  const supporting = [buildLoadContextInsight(input)];
  if (input.dominantDimensionLabel) {
    supporting.unshift(buildDominantSystemInsight(input));
  }
  return supporting;
}

export function buildEffortInsightBundle(input: EffortInsightInput) {
  return buildProductInsightBundle({
    primary: [buildDailyCostInsight(input), buildTrainingCapacityInsight(input)],
    supporting: collectSupportingEffortInsights(input),
    contextual: [],
  });
}
