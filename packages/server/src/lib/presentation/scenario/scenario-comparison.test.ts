import { describe, expect, it } from 'vitest';
import {
  buildScenarioComparisonViewModel,
  isGenericEquivalentExplanation,
} from '@sharpit/server/lib/presentation/scenario/scenario-comparison';
import type { ScenarioComparison, ScenarioComparisonEntry } from '@sharpit/core/scenario/types';
import { SCENARIO_MODEL_ID } from '@sharpit/core/scenario/types';

const EQUIVALENT_NOTE = 'Équivalent au plan actuel sur les sorties Decision Engine comparées.';

function mockScenarioEntry(
  partial: Partial<ScenarioComparisonEntry> &
    Pick<ScenarioComparisonEntry, 'scenarioId' | 'kind' | 'label'>,
): ScenarioComparisonEntry {
  return {
    rationale: 'test',
    targetSessionId: 's1',
    triggeredByDomain: 'FATIGUE',
    decision: {
      endVerdict: 'TRAIN_SMART',
      worstVerdict: 'TRAIN_SMART',
      endConfidence: 0.6,
      endConfidenceTier: 'MEDIUM',
      endExpectedBenefit: 0.5,
      endLimitingFactorDomain: 'FATIGUE',
      endLimitingFactorPriority: 2,
      riskDayCount: 1,
      horizonMeanConfidence: 0.6,
    },
    decisionDeltaVsBaseline: {
      endVerdictChanged: false,
      endVerdictImproved: null,
      endConfidenceDelta: 0,
      endExpectedBenefitDelta: 0,
      endLimitingFactorDomainChanged: false,
      worstVerdictImproved: null,
      riskDayCountDelta: 0,
    },
    outcome: {
      endReadiness: 70,
      endFatigue: 40,
      endAdaptation: 55,
      maxEnvironmentalImpact: 'MODERATE',
      endTsb: -5,
    },
    tradeOffs: [],
    preferabilityExplanation: EQUIVALENT_NOTE,
    isPreferredOverBaseline: false,
    projection: { days: [{ decision: { limitingFactor: { domain: 'FATIGUE' } } }] } as never,
    ...partial,
  };
}

function mockComparison(overrides?: {
  scenarios?: ScenarioComparisonEntry[];
  recommendedScenarioId?: string;
}): ScenarioComparison {
  const scenarios = overrides?.scenarios ?? [
    mockScenarioEntry({
      scenarioId: 'keep',
      kind: 'KEEP_PLAN',
      label: 'Garder le plan actuel',
      rationale: 'Exécuter le plan tel qu’il est planifié.',
    }),
    mockScenarioEntry({
      scenarioId: 'remove',
      kind: 'REMOVE_SESSION',
      label: 'Retirer « Renfo »',
      rationale: 'Retire la séance du plan sur l’horizon — maximise la récupération projetée.',
      decision: {
        endVerdict: 'RECOVER',
        worstVerdict: 'TRAIN_EASY',
        endConfidence: 0.7,
        endConfidenceTier: 'MEDIUM',
        endExpectedBenefit: 0.6,
        endLimitingFactorDomain: 'RECOVERY',
        endLimitingFactorPriority: 1,
        riskDayCount: 0,
        horizonMeanConfidence: 0.7,
      },
      decisionDeltaVsBaseline: {
        endVerdictChanged: true,
        endVerdictImproved: true,
        endConfidenceDelta: 0.1,
        endExpectedBenefitDelta: 0.1,
        endLimitingFactorDomainChanged: true,
        worstVerdictImproved: true,
        riskDayCountDelta: -1,
      },
      outcome: {
        endReadiness: 75,
        endFatigue: 35,
        endAdaptation: 58,
        maxEnvironmentalImpact: 'NONE',
        endTsb: 0,
      },
      preferabilityExplanation:
        'verdict de fin d’horizon plus favorable (Entraînement malin → Récupération) · 1 jour à risque en moins',
      isPreferredOverBaseline: true,
      projection: { days: [{ decision: { limitingFactor: { domain: 'RECOVERY' } } }] } as never,
    }),
  ];

  return {
    modelId: SCENARIO_MODEL_ID,
    athleteId: 'a1',
    anchorTrainingDayId: '2026-07-14',
    horizonDays: 7,
    focusSessionId: 's1',
    focusSessionLabel: 'Renfo Stabilité',
    anchorDecisionDomain: 'FATIGUE',
    computedAt: new Date().toISOString(),
    baselineScenarioId: 'keep',
    recommendedScenarioId: overrides?.recommendedScenarioId ?? 'remove',
    recommendation: 'Préférer « Retirer »',
    recommendationRationale: 'test',
    comparisonMethod: 'lex',
    scenarios,
  };
}

describe('scenario-comparison presentation', () => {
  it('detects generic equivalent explanations', () => {
    expect(isGenericEquivalentExplanation(EQUIVALENT_NOTE)).toBe(true);
  });

  it('builds summary lines without repeating raw metrics', () => {
    const vm = buildScenarioComparisonViewModel(mockComparison());
    expect(vm.visible).toBe(true);
    expect(vm.horizonDays).toBe(7);
    expect(vm.recommendedScenarioId).toBe('remove');
    expect(vm.recommendedScenarioLabel).toBe('Retirer « Renfo »');
    const recommended = vm.scenarios.find((s) => s.isRecommended);
    expect(recommended?.canApply).toBe(true);
    expect(recommended?.targetSessionId).toBe('s1');
    expect(recommended?.summaryLine).toContain('Retire la séance');
    expect(recommended?.summaryLine).not.toContain('Readiness');
    expect(vm.sharedEquivalentNote).toBeNull();
    const baseline = vm.scenarios.find((s) => s.isBaseline);
    expect(baseline?.canApply).toBe(false);
  });

  it('hoists shared equivalent note when all alternatives tie', () => {
    const base = mockComparison();
    const tiedRemove = mockScenarioEntry({
      ...base.scenarios[1],
      scenarioId: 'remove',
      kind: 'REMOVE_SESSION',
      label: 'Retirer « Renfo »',
      preferabilityExplanation: EQUIVALENT_NOTE,
      isPreferredOverBaseline: false,
    });
    const postpone = mockScenarioEntry({
      scenarioId: 'postpone',
      kind: 'DELAY_SESSION',
      label: 'Reporter',
      rationale: 'Décale la séance d’un jour pour lisser la charge.',
      preferabilityExplanation: EQUIVALENT_NOTE,
      isPreferredOverBaseline: false,
    });

    const comparison = mockComparison({
      scenarios: [base.scenarios[0], tiedRemove, postpone],
      recommendedScenarioId: 'keep',
    });

    const vm = buildScenarioComparisonViewModel(comparison);
    expect(vm.visible).toBe(false);
    expect(vm.sharedEquivalentNote).toContain('équivalent au plan actuel');
    const alt = vm.scenarios.find((s) => s.label === 'Reporter');
    expect(alt?.summaryLine).not.toContain('Équivalent au plan');
  });
});
