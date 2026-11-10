/**
 * Frozen athlete personas against evaluatePlan — no LLM, no I/O.
 * Metamorphic cases change one input and assert the finding appears or disappears.
 */
import { describe, expect, it } from 'vitest';
import { COLD_START_LOAD_PER_SESSION } from '@sharpit/app/lib/plan-gate/cold-start';
import { evaluatePlan } from './evaluate-plan';
import { baseContext, baseProposal, decisionState, physicalHealthData } from './test-fixtures';
import type { GateContext, GateProposal } from '@sharpit/app/lib/plan-gate/types';

const WEEK_START = new Date('2026-07-13T00:00:00');
const PLAN_WEEK = { planWindow: { start: WEEK_START, days: 7 } } as const;

/** Tue / Thu / Sat — three free days. */
const THREE_DAYS = [2, 4, 6] as const;
const THREE_DATES = ['2026-07-14', '2026-07-16', '2026-07-18'] as const;

function codes(result: ReturnType<typeof evaluatePlan>): string[] {
  return [
    ...result.sessions.flatMap((s) => s.findings.map((f) => f.ruleCode)),
    ...result.planLevelFindings.map((f) => f.ruleCode),
  ];
}

function has(result: ReturnType<typeof evaluatePlan>, ruleCode: string): boolean {
  return codes(result).includes(ruleCode);
}

function weekOn(dates: readonly string[], load = 50): GateProposal[] {
  return dates.map((date) => baseProposal({ date, load, intensity: 'ENDURANCE' }));
}

function pregnantT2(overrides: Partial<GateContext> = {}): GateContext {
  return baseContext({
    decision: decisionState(),
    medicalClearanceOwed: true,
    ...PLAN_WEEK,
    declaredSessionsPerWeek: 3,
    declaredWeekdays: [...THREE_DAYS],
    ...overrides,
  });
}

function osteoporosisBeginner(overrides: Partial<GateContext> = {}): GateContext {
  return baseContext({
    decision: decisionState(),
    medicalClearanceOwed: true,
    dailyTrainingStress: [],
    ...PLAN_WEEK,
    declaredSessionsPerWeek: 3,
    declaredWeekdays: [...THREE_DAYS],
    ...overrides,
  });
}

/** Watch-less, asked for an intensive week, no PMC history. */
function coldStartIntensif(overrides: Partial<GateContext> = {}): GateContext {
  return baseContext({
    decision: decisionState(),
    dailyTrainingStress: [],
    ...PLAN_WEEK,
    declaredSessionsPerWeek: 5,
    declaredWeekdays: [1, 2, 3, 4, 5],
    ...overrides,
  });
}

/** Recent load high enough that a normal week stays under the ACWR ceiling. */
function triathleteWithHistory(overrides: Partial<GateContext> = {}): GateContext {
  const stress = Array.from({ length: 14 }, (_, i) => ({
    load: 70,
    date: new Date(WEEK_START.getTime() - (14 - i) * 86_400_000),
  }));
  return baseContext({
    decision: decisionState(),
    dailyTrainingStress: stress,
    ...PLAN_WEEK,
    declaredSessionsPerWeek: 6,
    declaredWeekdays: [1, 2, 3, 4, 5, 6],
    ...overrides,
  });
}

function fragileKnee(overrides: Partial<GateContext> = {}): GateContext {
  return baseContext({
    decision: decisionState(),
    ...PLAN_WEEK,
    declaredSessionsPerWeek: 3,
    declaredWeekdays: [...THREE_DAYS],
    trainingZones: [
      {
        title: 'Genou droit',
        bodyPart: 'Genou',
        side: 'RIGHT',
        category: 'PAIN',
        status: 'ACTIVE',
        severity: 4,
        affectsTraining: true,
      },
    ],
    physicalHealth: physicalHealthData({ conditions: [] }),
    ...overrides,
  });
}

describe('plan-gate personas', () => {
  it('pregnant T2: refuses VO2max, keeps easy endurance', () => {
    const context = pregnantT2();
    const hard = evaluatePlan(context, [
      baseProposal({ date: THREE_DATES[0], intensity: 'VO2MAX', load: 80 }),
    ]);
    const easy = evaluatePlan(context, weekOn(THREE_DATES));

    expect(hard.sessions[0]?.status).toBe('REJECTED');
    expect(has(hard, 'MEDICAL_CLEARANCE_OWED')).toBe(true);
    expect(has(easy, 'MEDICAL_CLEARANCE_OWED')).toBe(false);
  });

  it('osteoporosis (clearance owed): same intensity ceiling as pregnancy', () => {
    const result = evaluatePlan(osteoporosisBeginner(), [
      baseProposal({ date: THREE_DATES[0], intensity: 'TEMPO', load: 70 }),
    ]);
    expect(has(result, 'MEDICAL_CLEARANCE_OWED')).toBe(true);
  });

  it('cold-start intensif: over a first-week dose warns on weekly load', () => {
    const ceiling = COLD_START_LOAD_PER_SESSION * 5;
    const dates = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'] as const;
    const overloaded = dates.map((date) =>
      baseProposal({ date, load: Math.ceil(ceiling / 4), intensity: 'ENDURANCE' }),
    );
    expect(has(evaluatePlan(coldStartIntensif(), overloaded), 'WEEKLY_LOAD_EXCEEDED')).toBe(true);
  });

  it('triathlete with history: a modest week does not trip the cold-start ceiling', () => {
    const modest = [
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ].map((date) => baseProposal({ date, load: 50, intensity: 'ENDURANCE' }));
    expect(has(evaluatePlan(triathleteWithHistory(), modest), 'WEEKLY_LOAD_EXCEEDED')).toBe(false);
  });

  it('fragile knee: a run is flagged, a swim is not', () => {
    const context = fragileKnee();
    expect(
      has(
        evaluatePlan(context, [baseProposal({ date: THREE_DATES[0], type: 'RUN' })]),
        'SENSITIVE_ZONE_LOADED',
      ),
    ).toBe(true);
    expect(
      has(
        evaluatePlan(context, [baseProposal({ date: THREE_DATES[0], type: 'SWIM' })]),
        'SENSITIVE_ZONE_LOADED',
      ),
    ).toBe(false);
  });

  it('declared availability: three sessions on free days pass quietly', () => {
    const result = evaluatePlan(pregnantT2({ medicalClearanceOwed: false }), weekOn(THREE_DATES));
    expect(has(result, 'AVAILABILITY_SESSION_COUNT')).toBe(false);
    expect(has(result, 'AVAILABILITY_WEEKDAY')).toBe(false);
  });
});

describe('plan-gate metamorphic', () => {
  it('lifting medical clearance removes MEDICAL_CLEARANCE_OWED on the same VO2 session', () => {
    const proposal = [baseProposal({ date: THREE_DATES[0], intensity: 'VO2MAX', load: 80 })];
    const owed = evaluatePlan(pregnantT2({ medicalClearanceOwed: true }), proposal);
    const clear = evaluatePlan(pregnantT2({ medicalClearanceOwed: false }), proposal);

    expect(has(owed, 'MEDICAL_CLEARANCE_OWED')).toBe(true);
    expect(has(clear, 'MEDICAL_CLEARANCE_OWED')).toBe(false);
  });

  it('moving one session onto a blocked weekday adds AVAILABILITY_WEEKDAY', () => {
    const context = pregnantT2({ medicalClearanceOwed: false });
    const onFreeDays = weekOn(THREE_DATES);
    const withFriday = [
      baseProposal({ date: '2026-07-14', load: 50 }),
      baseProposal({ date: '2026-07-16', load: 50 }),
      baseProposal({ date: '2026-07-17', load: 50 }),
    ];

    expect(has(evaluatePlan(context, onFreeDays), 'AVAILABILITY_WEEKDAY')).toBe(false);
    expect(has(evaluatePlan(context, withFriday), 'AVAILABILITY_WEEKDAY')).toBe(true);
  });

  it('adding a fourth session when three were declared adds AVAILABILITY_SESSION_COUNT', () => {
    const context = pregnantT2({ medicalClearanceOwed: false });
    const three = weekOn(THREE_DATES);
    const four = [...three, baseProposal({ date: '2026-07-15', load: 50 })];

    expect(has(evaluatePlan(context, three), 'AVAILABILITY_SESSION_COUNT')).toBe(false);
    expect(has(evaluatePlan(context, four), 'AVAILABILITY_SESSION_COUNT')).toBe(true);
  });

  it('removing the knee declaration drops SENSITIVE_ZONE_LOADED on the same run', () => {
    const run = [baseProposal({ date: THREE_DATES[0], type: 'RUN' })];
    const withKnee = evaluatePlan(fragileKnee(), run);
    const without = evaluatePlan(fragileKnee({ trainingZones: [] }), run);

    expect(has(withKnee, 'SENSITIVE_ZONE_LOADED')).toBe(true);
    expect(has(without, 'SENSITIVE_ZONE_LOADED')).toBe(false);
  });

  it('giving the cold-start athlete recent load removes the empty-history ceiling trip', () => {
    const dates = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'] as const;
    const loadEach = Math.ceil((COLD_START_LOAD_PER_SESSION * 5) / 4);
    const proposals = dates.map((date) =>
      baseProposal({ date, load: loadEach, intensity: 'ENDURANCE' }),
    );
    const empty = evaluatePlan(coldStartIntensif(), proposals);
    const withHistory = evaluatePlan(
      coldStartIntensif({
        dailyTrainingStress: Array.from({ length: 14 }, (_, i) => ({
          load: 80,
          date: new Date(WEEK_START.getTime() - (14 - i) * 86_400_000),
        })),
      }),
      proposals,
    );

    expect(has(empty, 'WEEKLY_LOAD_EXCEEDED')).toBe(true);
    expect(has(withHistory, 'WEEKLY_LOAD_EXCEEDED')).toBe(false);
  });
});
