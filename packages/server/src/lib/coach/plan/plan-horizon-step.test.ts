import { describe, expect, it } from 'vitest';
import { nextWeekStart, planHorizonStep, type PlanHorizonState } from './plan-horizon-step';

const today = '2026-10-19';

function state(patch: Partial<PlanHorizonState> = {}): PlanHorizonState {
  return { jobId: 'job-1', startDate: '2026-10-22', remindedAt: null, appliedAt: null, ...patch };
}

describe('nextWeekStart', () => {
  it('starts the day after the last planned session, never before tomorrow', () => {
    expect(nextWeekStart(today, '2026-10-21')).toBe('2026-10-22');
    expect(nextWeekStart(today, null)).toBe('2026-10-20');
    expect(nextWeekStart(today, today)).toBe('2026-10-20');
  });
});

describe('planHorizonStep', () => {
  it('writes the next week three days before the plan runs out', () => {
    expect(
      planHorizonStep({
        today,
        lastPlannedDay: '2026-10-21',
        state: null,
        jobStatus: null,
        weekAlreadyPlanned: false,
      }),
    ).toEqual({ kind: 'generate', startDate: '2026-10-22' });
  });

  it('leaves a plan that still runs further than three days', () => {
    expect(
      planHorizonStep({
        today,
        lastPlannedDay: '2026-10-25',
        state: null,
        jobStatus: null,
        weekAlreadyPlanned: false,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('writes a week from tomorrow when nothing is planned ahead', () => {
    expect(
      planHorizonStep({
        today,
        lastPlannedDay: null,
        state: null,
        jobStatus: null,
        weekAlreadyPlanned: false,
      }),
    ).toEqual({ kind: 'generate', startDate: '2026-10-20' });
  });

  it('reminds once, two days before the week starts', () => {
    const input = {
      today: '2026-10-20',
      lastPlannedDay: '2026-10-21',
      jobStatus: 'ready' as const,
      weekAlreadyPlanned: false,
    };
    expect(planHorizonStep({ ...input, state: state() })).toEqual({ kind: 'remind' });
    expect(
      planHorizonStep({ ...input, state: state({ remindedAt: '2026-10-20T07:00:00Z' }) }),
    ).toEqual({
      kind: 'none',
    });
  });

  it('adds the week as written the day before it starts', () => {
    expect(
      planHorizonStep({
        today: '2026-10-21',
        lastPlannedDay: '2026-10-21',
        state: state({ remindedAt: '2026-10-20T07:00:00Z' }),
        jobStatus: 'ready',
        weekAlreadyPlanned: false,
      }),
    ).toEqual({ kind: 'apply' });
  });

  it('stops as soon as the athlete kept sessions of the week', () => {
    expect(
      planHorizonStep({
        today: '2026-10-21',
        lastPlannedDay: '2026-10-25',
        state: state(),
        jobStatus: 'ready',
        weekAlreadyPlanned: true,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('writes the week again when its generation failed or expired', () => {
    expect(
      planHorizonStep({
        today: '2026-10-20',
        lastPlannedDay: '2026-10-21',
        state: state(),
        jobStatus: 'failed',
        weekAlreadyPlanned: false,
      }),
    ).toEqual({ kind: 'generate', startDate: '2026-10-22' });
  });

  it('waits while the week is being written', () => {
    expect(
      planHorizonStep({
        today: '2026-10-20',
        lastPlannedDay: '2026-10-21',
        state: state(),
        jobStatus: 'running',
        weekAlreadyPlanned: false,
      }),
    ).toEqual({ kind: 'none' });
  });
});
