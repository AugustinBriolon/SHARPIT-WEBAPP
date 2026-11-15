import { describe, expect, it } from 'vitest';
import type { CoachPlan } from '@sharpit/app/lib/validators/coach';
import { scorePlanWeek, type PlanRubricCheckId, type RubricPhase } from './plan-week-rubric';

type Session = CoachPlan['sessions'][number];

const session = (overrides: Partial<Session> = {}): Session => ({
  dayOffset: 0,
  startTime: null,
  type: 'RUN',
  intensity: 'ENDURANCE',
  title: 'Sortie endurance',
  description: 'Footing continu.',
  durationMin: 60,
  load: 50,
  rationale: 'Volume aérobie de la semaine.',
  ...overrides,
});

const SPORTS = ['RUN', 'BIKE', 'SWIM'];

/** 360 easy minutes over the three sports: the hard share of a week is then easy to read. */
const easyWeek: Session[] = [
  session({ dayOffset: 0, type: 'SWIM', durationMin: 60 }),
  session({ dayOffset: 1, type: 'BIKE', durationMin: 120 }),
  session({ dayOffset: 3, type: 'RUN', durationMin: 60 }),
  session({ dayOffset: 5, type: 'BIKE', durationMin: 120 }),
];

function score(sessions: Session[], phase: RubricPhase | null = 'BUILD', days = 7) {
  return scorePlanWeek({
    plan: { summary: 'Semaine.', sessions },
    phase,
    practisedSports: SPORTS,
    days,
  });
}

const checksOf = (sessions: Session[], phase: RubricPhase | null = 'BUILD', days = 7) =>
  score(sessions, phase, days).findings.map((finding) => finding.check);

// Synthetic weeks, none holds athlete data. The all-easy build week is the pattern the prod
// audit found: tempo and endurance, no session above threshold.
describe('scorePlanWeek', () => {
  it('scores a build week with one threshold session at 100', () => {
    const week = [...easyWeek, session({ dayOffset: 2, intensity: 'THRESHOLD', durationMin: 50 })];
    expect(score(week)).toEqual({ score: 100, findings: [] });
  });

  it('flags a build week with nothing above tempo', () => {
    expect(checksOf(easyWeek)).toEqual(['hard-share-low']);
    expect(score(easyWeek).score).toBe(80);
  });

  it('accepts the same all-easy week in base', () => {
    expect(checksOf(easyWeek, 'BASE')).toEqual([]);
  });

  it('flags a base week loaded with hard work', () => {
    const week = [...easyWeek, session({ dayOffset: 2, intensity: 'VO2MAX', durationMin: 60 })];
    expect(checksOf(week, 'BASE')).toEqual(['hard-share-high']);
  });

  it('flags a week living in the middle zone', () => {
    const week = [
      session({ dayOffset: 0, type: 'SWIM', durationMin: 45 }),
      session({ dayOffset: 1, type: 'BIKE', intensity: 'TEMPO', durationMin: 90 }),
      session({ dayOffset: 3, type: 'RUN', intensity: 'TEMPO', durationMin: 50 }),
      session({ dayOffset: 5, type: 'RUN', intensity: 'THRESHOLD', durationMin: 30 }),
    ];
    expect(checksOf(week)).toEqual(['middle-share-high']);
  });

  it('does not judge the distribution without a phase or in a race week', () => {
    expect(checksOf(easyWeek, null)).toEqual([]);
    expect(checksOf(easyWeek, 'RACE')).toEqual([]);
  });

  it('leaves strength out of the distribution', () => {
    const week = [
      ...easyWeek,
      session({ dayOffset: 2, intensity: 'THRESHOLD', durationMin: 50 }),
      session({ dayOffset: 4, type: 'STRENGTH', intensity: 'TEMPO', durationMin: 400 }),
    ];
    expect(checksOf(week)).toEqual([]);
  });

  it('flags more than three hard sessions within seven days', () => {
    const hard = (dayOffset: number, type: Session['type']) =>
      session({ dayOffset, type, intensity: 'THRESHOLD', durationMin: 20 });
    const week = [...easyWeek, hard(0, 'RUN'), hard(2, 'BIKE'), hard(4, 'SWIM'), hard(6, 'RUN')];
    expect(checksOf(week, null)).toEqual(['too-many-hard']);
  });

  it('flags two hard sessions of one sport on consecutive days, not of two sports', () => {
    const hard = (dayOffset: number, type: Session['type']) =>
      session({ dayOffset, type, intensity: 'VO2MAX', durationMin: 20 });
    expect(checksOf([...easyWeek, hard(2, 'RUN'), hard(3, 'RUN')], null)).toEqual([
      'hard-back-to-back',
    ]);
    expect(checksOf([...easyWeek, hard(2, 'RUN'), hard(3, 'BIKE')], null)).toEqual([]);
  });

  it('flags a hard session written without a reason', () => {
    const week = [
      ...easyWeek,
      session({ dayOffset: 2, intensity: 'THRESHOLD', durationMin: 50, rationale: '  ' }),
    ];
    expect(checksOf(week)).toEqual(['missing-rationale']);
  });

  it('flags a practised sport absent from a full week, not from a shorter block', () => {
    const noSwim = easyWeek.filter((entry) => entry.type !== 'SWIM');
    const expected: PlanRubricCheckId[] = ['sport-missing'];
    expect(checksOf(noSwim, null)).toEqual(expected);
    expect(checksOf(noSwim, null, 3)).toEqual([]);
  });

  it('never scores below zero', () => {
    const hard = (dayOffset: number) =>
      session({ dayOffset, intensity: 'VO2MAX', durationMin: 90, rationale: '' });
    const week = [hard(0), hard(1), hard(2), hard(3), hard(4), hard(5)];
    expect(score(week, 'BASE').score).toBe(0);
  });
});
