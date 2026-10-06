import { describe, expect, it } from 'vitest';
import { buildSessionRationaleViewModel } from './session-rationale';
import { baseProposal } from '@sharpit/server/lib/plan-gate/test-fixtures';
import type {
  CoachingDecisionWithHistory,
  DecisionSnapshotContext,
} from '@sharpit/app/lib/decision-memory/types';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function baseSession(
  overrides: Partial<Parameters<typeof buildSessionRationaleViewModel>[0]['session']> = {},
) {
  return {
    id: 'session-1',
    type: 'RUN' as const,
    intensity: 'ENDURANCE' as const,
    durationMin: 60,
    load: 50,
    date: new Date('2026-07-14T08:00:00.000Z'),
    completed: false,
    activityId: null,
    ...overrides,
  };
}

const EMPTY_SNAPSHOT_CONTEXT: DecisionSnapshotContext = {
  confidence: null,
  confidenceTier: null,
  overallVerdict: null,
  limitingFactorSystem: null,
  physicalHealthCapacity: null,
  fatigueTrainingCapacity: null,
};

function baseDecision(
  overrides: Partial<CoachingDecisionWithHistory> = {},
): CoachingDecisionWithHistory {
  return {
    id: 'decision-1',
    athleteId: 'default',
    trainingDayId: '2026-07-14',
    source: 'PLAN_GENERATOR',
    status: 'ACCEPTED',
    proposal: baseProposal({ rationale: 'Séance clé pour construire la base aérobie.' }),
    gateResult: {
      proposal: baseProposal(),
      status: 'ACCEPTED',
      findings: [],
      requiredAssumptions: [],
      saferAlternative: null,
    },
    snapshotContext: EMPTY_SNAPSHOT_CONTEXT,
    snapshotIdAtRecommendation: 'snap-1',
    createdAt: NOW,
    actions: [],
    outcome: null,
    ...overrides,
  };
}

describe('buildSessionRationaleViewModel', () => {
  it('returns origin MANUAL with only observed populated when there is no origin decision', () => {
    const vm = buildSessionRationaleViewModel({ session: baseSession(), decision: null, now: NOW });

    expect(vm.origin).toBe('MANUAL');
    expect(vm.observed.type).toBeTruthy();
    expect(vm.inferred).toBeNull();
    expect(vm.suggested).toBeNull();
    expect(vm.chosen).toBeNull();
    expect(vm.outcome).toBeNull();
    expect(vm.emptyState).not.toBeNull();
  });

  it('maps the four buckets from a fixture CoachingDecisionWithHistory', () => {
    const decision = baseDecision({
      snapshotContext: {
        confidence: 0.8,
        confidenceTier: 'HIGH',
        overallVerdict: 'TRAIN_SMART',
        limitingFactorSystem: 'RECOVERY',
        physicalHealthCapacity: 'FULL',
        fatigueTrainingCapacity: 'REDUCED',
      },
      actions: [
        {
          id: 'action-1',
          decisionId: 'decision-1',
          actionType: 'ACCEPTED',
          occurredAt: NOW,
          source: 'PLAN_REVIEW_UI',
          rationale: null,
          resultingPlannedSessionId: 'session-1',
        },
      ],
    });

    const vm = buildSessionRationaleViewModel({ session: baseSession(), decision, now: NOW });

    expect(vm.origin).toBe('COACH');
    expect(vm.inferred?.overallVerdictLabel).toBeTruthy();
    expect(vm.inferred?.confidenceTierLabel).toContain('élevée');
    expect(vm.inferred?.limitingFactorLabel).toContain('Récupération');
    expect(vm.suggested?.purpose).toBe('Séance clé pour construire la base aérobie.');
    expect(vm.chosen?.actionHistory).toHaveLength(1);
    expect(vm.chosen?.actionHistory[0]?.actionType).toBe('ACCEPTED');
    expect(vm.emptyState).toBeNull();
  });

  it('never leaks a raw ruleCode into the serialized output', () => {
    const decision = baseDecision({
      gateResult: {
        proposal: baseProposal(),
        status: 'WARNING',
        findings: [
          {
            ruleCode: 'WEEKLY_LOAD_EXCEEDED',
            severity: 'WARNING',
            rationale: 'Charge hebdomadaire au-dessus de la cible.',
            evidenceRefs: [],
          },
        ],
        requiredAssumptions: [],
        saferAlternative: null,
      },
    });

    const vm = buildSessionRationaleViewModel({ session: baseSession(), decision, now: NOW });
    const serialized = JSON.stringify(vm);

    expect(serialized).not.toContain('ruleCode');
    expect(serialized).not.toContain('WEEKLY_LOAD_EXCEEDED');
    expect(vm.suggested?.gate.findings[0]?.rationale).toBe(
      'Charge hebdomadaire au-dessus de la cible.',
    );
  });

  it('resolves Gate evidenceRefs into French evidenceLabels without leaking raw paths', () => {
    const decision = baseDecision({
      gateResult: {
        proposal: baseProposal(),
        status: 'REJECTED',
        findings: [
          {
            ruleCode: 'DECISION_LOW_CONFIDENCE',
            severity: 'REJECTED',
            rationale: 'Confiance trop faible.',
            evidenceRefs: ['decision.confidenceTier', 'decision.confidence'],
          },
        ],
        requiredAssumptions: [],
        saferAlternative: null,
      },
    });

    const vm = buildSessionRationaleViewModel({ session: baseSession(), decision, now: NOW });
    const finding = vm.suggested?.gate.findings[0];
    expect(finding?.evidenceLabels).toEqual([
      'Niveau de confiance de la décision',
      'Score de confiance',
    ]);
    expect(JSON.stringify(vm)).not.toContain('decision.confidenceTier');
  });

  it('surfaces weeklyObjectiveRelation only when the Gate itself found something to say about it', () => {
    const withFinding = buildSessionRationaleViewModel({
      session: baseSession(),
      decision: baseDecision({
        gateResult: {
          proposal: baseProposal(),
          status: 'WARNING',
          findings: [
            {
              ruleCode: 'WEEKLY_LOAD_EXCEEDED',
              severity: 'WARNING',
              rationale: 'Charge hebdomadaire au-dessus de la cible.',
              evidenceRefs: [],
            },
          ],
          requiredAssumptions: [],
          saferAlternative: null,
        },
      }),
      now: NOW,
    });
    expect(withFinding.suggested?.weeklyObjectiveRelation).toBe(
      'Charge hebdomadaire au-dessus de la cible.',
    );

    const withoutFinding = buildSessionRationaleViewModel({
      session: baseSession(),
      decision: baseDecision(),
      now: NOW,
    });
    expect(withoutFinding.suggested?.weeklyObjectiveRelation).toBeNull();
  });

  it('renders suggested.purpose as null, not a placeholder, when the proposal has no rationale', () => {
    const decision = baseDecision({ proposal: baseProposal({ rationale: null }) });
    const vm = buildSessionRationaleViewModel({ session: baseSession(), decision, now: NOW });
    expect(vm.suggested?.purpose).toBeNull();
  });

  it('includes outcome wording only once an outcome has actually been evaluated', () => {
    const notYetEvaluated = buildSessionRationaleViewModel({
      session: baseSession(),
      decision: baseDecision(),
      now: NOW,
    });
    expect(notYetEvaluated.outcome).toBeNull();

    const evaluated = buildSessionRationaleViewModel({
      session: baseSession({ completed: true, activityId: 'act-1' }),
      decision: baseDecision({
        outcome: {
          outcomeStatus: 'INCONCLUSIVE',
          executionMatch: null,
          subjectiveResponse: null,
          shortTermRecoveryResponse: null,
          safetySignal: null,
          limitations: ['no evidence'],
          confidence: 0,
        },
      }),
      now: NOW,
    });
    expect(evaluated.outcome?.status).toBe('INCONCLUSIVE');
    expect(evaluated.outcome?.wording).toEqual(['Preuves encore insuffisantes pour conclure.']);
  });

  it('derives executionState COMPLETED when the session is completed and linked to an activity', () => {
    const vm = buildSessionRationaleViewModel({
      session: baseSession({ completed: true, activityId: 'act-1' }),
      decision: baseDecision(),
      now: NOW,
    });
    expect(vm.chosen?.executionState).toBe('COMPLETED');
  });
});
