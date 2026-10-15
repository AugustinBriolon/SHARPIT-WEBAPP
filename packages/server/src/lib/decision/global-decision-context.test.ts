import { describe, expect, it } from 'vitest';
import { buildGlobalDecisionContext } from '@sharpit/server/lib/decision/global-decision-context';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import { mockDailyPhase, mockPhaseNarrative } from '@sharpit/server/lib/daily-phase/test-fixtures';

function minimalSnapshot(decision: AthleteSnapshot['decision']): AthleteSnapshot {
  return {
    snapshotId: 'x',
    athleteId: 'default',
    trainingDayId: '2026-07-07',
    generatedAt: new Date().toISOString(),
    freshness: {
      athleteId: 'default',
      trainingDayId: '2026-07-07',
      computedAt: new Date().toISOString(),
      domains: [],
      providers: [],
      overallFresh: true,
      primaryProductMessage: null,
    },
    recovery: null,
    fatigue: null,
    adaptation: null,
    physicalHealth: null,
    environment: null,
    dailyStrain: null,
    reasoning: null,
    decision,
    readiness: 72,
    sleepScore: 80,
    adaptationIndex: 65,
    adaptationStatus: 'MAINTAINING',
    adaptationTrend: 'STABLE',
    todaysDecision: decision?.primaryDecision.verdict ?? null,
    limitingFactor: null,
    confidence: decision?.confidence ?? null,
    briefing: null,
    recommendation: null,
    primaryProductMessage: null,
    domainMessages: {},
    adviceActionable: true,
    insufficientDataMessage: null,
    effortUnavailableMessage: null,
    confidenceLabel: 'Estimation modérée',
    dailyPhase: mockDailyPhase(),
    phaseNarrative: mockPhaseNarrative(),
    sessionsDoneToday: [],
    plannedToday: [],
  };
}

describe('buildGlobalDecisionContext', () => {
  it('returns visible context when decision is actionable', () => {
    const decision = {
      primaryDecision: {
        verdict: 'TRAIN_SMART' as const,
        headlineCode: 'decision.headline.trainSmart',
        verbCode: 'reasoning.topAction.trainSmart.verb',
        focusCode: 'reasoning.topAction.trainSmart.focus',
        rationaleCode: 'reasoning.topAction.trainSmart.rationale',
        expectedBenefit: 0.5,
      },
      limitingFactor: {
        domain: 'RECOVERY' as const,
        system: 'RECOVERY' as const,
        description: null,
        actionable: false,
        priority: 1,
      },
      supportingEvidence: [],
      suppressedEvidence: [],
      confidence: 0.72,
      confidenceTier: 'MEDIUM' as const,
      dataCompleteness: 'PARTIAL' as const,
      conflicts: [],
      priority: {
        attentionDomain: 'RECOVERY' as const,
        safetyOverrideApplied: false,
        confidenceGated: false,
      },
      explanationOrder: [],
      overallVerdict: 'TRAIN_SMART' as const,
      systemAttentionPriority: 'RECOVERY' as const,
      physiologicalConsistency: 'ALIGNED' as const,
      consistencyScore: 80,
      opportunities: [],
      topAction: {
        verbCode: 'reasoning.topAction.trainSmart.verb',
        focusCode: 'reasoning.topAction.trainSmart.focus',
        rationaleCode: 'reasoning.topAction.trainSmart.rationale',
        expectedBenefit: 0.5,
      },
      evidenceGraph: {
        recoveryContribution: 1,
        fatigueContribution: 0.5,
        adaptationContribution: 0.5,
      },
      modelId: 'decision-v1' as const,
      computedAt: new Date().toISOString(),
      trainingDayId: '2026-07-07',
    };

    const ctx = buildGlobalDecisionContext(minimalSnapshot(decision), 'RECOVERY');
    expect(ctx.visible).toBe(true);
    expect(ctx.domainRole).toBe('driving');
    expect(ctx.verdictLabel).toBe('Qualité');
  });

  it('hides when decision is missing', () => {
    const ctx = buildGlobalDecisionContext(minimalSnapshot(null), 'RECOVERY');
    expect(ctx.visible).toBe(false);
  });
});
