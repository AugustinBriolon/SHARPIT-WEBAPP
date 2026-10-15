import { describe, expect, it } from 'vitest';
import { buildWeeklyCoachingBriefViewModel } from './weekly-coaching-brief';
import { baseProposal } from '@sharpit/server/lib/plan-gate/test-fixtures';
import type { CoachingDecisionRecord } from '@sharpit/app/lib/decision-memory/types';

const WEEK_START = new Date('2026-07-13T00:00:00.000Z'); // Monday
const NOW = new Date('2026-07-15T12:00:00.000Z');

function session(
  overrides: Partial<
    Parameters<typeof buildWeeklyCoachingBriefViewModel>[0]['plannedSessions'][number]
  > = {},
) {
  return {
    id: 'session-1',
    date: new Date('2026-07-14T08:00:00.000Z'),
    type: 'RUN' as const,
    intensity: 'ENDURANCE' as const,
    durationMin: 60,
    load: 50,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof buildWeeklyCoachingBriefViewModel>[0]> = {},
): Parameters<typeof buildWeeklyCoachingBriefViewModel>[0] {
  return {
    weekStart: WEEK_START,
    now: NOW,
    planWeek: null,
    goal: null,
    plannedSessions: [],
    dailyTrainingStress: [],
    sessionDecisions: new Map(),
    todaysSnapshotContext: null,
    learningFeedback: [],
    ...overrides,
  };
}

function decisionRecord(overrides: Partial<CoachingDecisionRecord> = {}): CoachingDecisionRecord {
  return {
    id: 'decision-1',
    athleteId: 'default',
    trainingDayId: '2026-07-14',
    source: 'PLAN_GENERATOR',
    status: 'ACCEPTED',
    proposal: baseProposal({ rationale: 'Développer la base aérobie.' }),
    gateResult: {
      proposal: baseProposal(),
      status: 'ACCEPTED',
      findings: [],
      requiredAssumptions: [],
      saferAlternative: null,
    },
    snapshotContext: {
      confidence: null,
      confidenceTier: null,
      overallVerdict: null,
      limitingFactorSystem: null,
      physicalHealthCapacity: null,
      fatigueTrainingCapacity: null,
    },
    snapshotIdAtRecommendation: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('buildWeeklyCoachingBriefViewModel', () => {
  it('shows a single empty state and never fabricates an objective when nothing is configured', () => {
    const vm = buildWeeklyCoachingBriefViewModel(baseInput());

    expect(vm.visible).toBe(true);
    expect(vm.emptyState).not.toBeNull();
    expect(vm.planContext).toBeNull();
    expect(vm.goalContext).toBeNull();
    expect(vm.load).toBeNull();
    expect(vm.keySessions).toEqual([]);
  });

  it('shows plan section only when a plan week exists but no goal', () => {
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        planWeek: { phase: 'BASE', targetLoad: 400, isDeload: false, focus: null },
        plannedSessions: [session()],
      }),
    );

    expect(vm.emptyState).toBeNull();
    expect(vm.planContext).not.toBeNull();
    expect(vm.goalContext).toBeNull();
  });

  it('selects key sessions by intensity threshold', () => {
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        plannedSessions: [
          session({ id: 's1', intensity: 'ENDURANCE', durationMin: 40 }),
          session({ id: 's2', intensity: 'THRESHOLD', durationMin: 45 }),
        ],
      }),
    );

    const ids = vm.keySessions.map((s) => s.sessionId);
    expect(ids).toContain('s2');
    expect(ids).not.toContain('s1');
  });

  it('selects key sessions by duration above the week median even without a key intensity', () => {
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        plannedSessions: [
          session({ id: 's1', intensity: 'ENDURANCE', durationMin: 30 }),
          session({ id: 's2', intensity: 'ENDURANCE', durationMin: 120 }),
        ],
      }),
    );

    expect(vm.keySessions.map((s) => s.sessionId)).toContain('s2');
  });

  it('uses the proposal rationale as key-session purpose only when Decision Memory provenance exists', () => {
    const decisions = new Map([['s1', decisionRecord()]]);
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        plannedSessions: [session({ id: 's1', intensity: 'THRESHOLD' })],
        sessionDecisions: decisions,
      }),
    );

    expect(vm.keySessions[0]?.purpose).toBe('Développer la base aérobie.');
  });

  it('labels key sessions with the stamped goal title (option B)', () => {
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        plannedSessions: [session({ id: 's1', intensity: 'THRESHOLD', goalId: 'g1' })],
        goalTitleById: new Map([['g1', 'Ironman Nice']]),
      }),
    );

    expect(vm.keySessions[0]?.goalTitle).toBe('Ironman Nice');
  });

  it('omits the load section entirely when there is no plan and no activity history', () => {
    const vm = buildWeeklyCoachingBriefViewModel(baseInput({ plannedSessions: [session()] }));
    expect(vm.load?.toleratedCeiling).toBeNull();
    expect(vm.load?.toleratedSource).toBeNull();
  });

  it('uses the plan target as the tolerated ceiling when a plan week exists', () => {
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        planWeek: { phase: 'BUILD', targetLoad: 500, isDeload: false, focus: null },
        plannedSessions: [session()],
      }),
    );
    expect(vm.load?.toleratedSource).toBe('PLAN_TARGET');
    expect(vm.load?.toleratedCeiling).toBe(550); // 500 * 1.1
  });

  it('surfaces assumptions and dataGaps only from real Gate findings, never invented', () => {
    const decision = decisionRecord({
      gateResult: {
        proposal: baseProposal(),
        status: 'REQUIRES_CONFIRMATION',
        findings: [
          {
            ruleCode: 'MISSING_THRESHOLDS',
            severity: 'REQUIRES_CONFIRMATION',
            rationale: 'Pas de seuils enregistrés.',
            evidenceRefs: [],
          },
        ],
        requiredAssumptions: ['Zones estimées par défaut.'],
        saferAlternative: null,
      },
    });
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        plannedSessions: [session()],
        sessionDecisions: new Map([['session-1', decision]]),
      }),
    );

    expect(vm.assumptions).toContain('Zones estimées par défaut.');
    expect(vm.dataGaps).toContain('Pas de seuils enregistrés.');
  });

  it('states protected recovery days without inventing a strategy narrative', () => {
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        plannedSessions: [session({ date: new Date('2026-07-14T08:00:00.000Z') })],
      }),
    );
    expect(vm.recovery?.protectedDayLabels.length).toBe(6);
    expect(vm.recovery?.note).toBe('6 jours de récupération protégés cette semaine.');
  });

  it('pluralises a single protected recovery day', () => {
    const vm = buildWeeklyCoachingBriefViewModel(
      baseInput({
        plannedSessions: [
          session({ id: 's1', date: new Date('2026-07-13T08:00:00.000Z') }),
          session({ id: 's2', date: new Date('2026-07-14T08:00:00.000Z') }),
          session({ id: 's3', date: new Date('2026-07-15T08:00:00.000Z') }),
          session({ id: 's4', date: new Date('2026-07-16T08:00:00.000Z') }),
          session({ id: 's5', date: new Date('2026-07-17T08:00:00.000Z') }),
          session({ id: 's6', date: new Date('2026-07-18T08:00:00.000Z') }),
        ],
      }),
    );
    expect(vm.recovery?.protectedDayLabels).toEqual(['dimanche']);
    expect(vm.recovery?.note).toBe('1 jour de récupération protégés cette semaine.');
  });
});
