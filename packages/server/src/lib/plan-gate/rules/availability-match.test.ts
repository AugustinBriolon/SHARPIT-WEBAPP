import { describe, expect, it } from 'vitest';
import { availabilityMatchRule } from './availability-match';
import { baseContext, baseProposal } from '../test-fixtures';

const WEEK = {
  planWindow: { start: new Date('2026-07-13T00:00:00'), days: 7 },
} as const;

describe('availabilityMatchRule', () => {
  it('is silent without a plan window (targeted adapt)', () => {
    const context = baseContext({
      declaredSessionsPerWeek: 3,
      declaredWeekdays: [2, 4, 6],
    });
    expect(availabilityMatchRule(context, [baseProposal()])).toEqual([]);
  });

  it('is silent when availability was never declared', () => {
    const context = baseContext({ ...WEEK });
    expect(
      availabilityMatchRule(context, [
        baseProposal({ date: '2026-07-14' }),
        baseProposal({ date: '2026-07-16' }),
        baseProposal({ date: '2026-07-18' }),
      ]),
    ).toEqual([]);
  });

  it('warns when the week has more sessions than declared', () => {
    const context = baseContext({ ...WEEK, declaredSessionsPerWeek: 3 });
    const findings = availabilityMatchRule(context, [
      baseProposal({ date: '2026-07-14' }),
      baseProposal({ date: '2026-07-15' }),
      baseProposal({ date: '2026-07-16' }),
      baseProposal({ date: '2026-07-17' }),
      baseProposal({ date: '2026-07-18' }),
    ]);
    expect(findings.some((f) => f.ruleCode === 'AVAILABILITY_SESSION_COUNT')).toBe(true);
  });

  it('warns when the week has fewer sessions than declared', () => {
    const context = baseContext({ ...WEEK, declaredSessionsPerWeek: 3 });
    const findings = availabilityMatchRule(context, [baseProposal({ date: '2026-07-14' })]);
    expect(findings.some((f) => f.ruleCode === 'AVAILABILITY_SESSION_COUNT')).toBe(true);
  });

  it('is silent when the count matches the declaration', () => {
    const context = baseContext({ ...WEEK, declaredSessionsPerWeek: 3 });
    expect(
      availabilityMatchRule(context, [
        baseProposal({ date: '2026-07-14' }),
        baseProposal({ date: '2026-07-16' }),
        baseProposal({ date: '2026-07-18' }),
      ]),
    ).toEqual([]);
  });

  it('warns when a session lands on a day the athlete did not free', () => {
    const context = baseContext({ ...WEEK, declaredWeekdays: [2, 4, 6] });
    const findings = availabilityMatchRule(context, [
      baseProposal({ date: '2026-07-14' }),
      baseProposal({ date: '2026-07-17' }),
    ]);
    expect(findings.some((f) => f.ruleCode === 'AVAILABILITY_WEEKDAY')).toBe(true);
  });

  it('is silent when every session sits on a declared weekday', () => {
    const context = baseContext({
      ...WEEK,
      declaredSessionsPerWeek: 3,
      declaredWeekdays: [2, 4, 6],
    });
    expect(
      availabilityMatchRule(context, [
        baseProposal({ date: '2026-07-14' }),
        baseProposal({ date: '2026-07-16' }),
        baseProposal({ date: '2026-07-18' }),
      ]),
    ).toEqual([]);
  });
});
