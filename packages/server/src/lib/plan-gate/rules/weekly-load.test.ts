import { describe, expect, it } from 'vitest';
import { weeklyLoadRule } from './weekly-load';
import { baseContext, baseProposal } from '../test-fixtures';

describe('weeklyLoadRule', () => {
  it('warns when the projected week total exceeds the explicit plan target by more than 10%', () => {
    const context = baseContext({
      planWeeks: [{ weekStart: new Date('2026-07-13T00:00:00Z'), phase: 'BUILD', targetLoad: 100 }],
    });
    const proposals = [
      baseProposal({ date: '2026-07-14', load: 60 }),
      baseProposal({ date: '2026-07-16', load: 60 }),
    ];

    const findings = weeklyLoadRule(context, proposals);

    expect(findings.some((f) => f.ruleCode === 'WEEKLY_LOAD_EXCEEDED')).toBe(true);
  });

  it('is silent when the projected week total stays within 10% of the target', () => {
    const context = baseContext({
      planWeeks: [{ weekStart: new Date('2026-07-13T00:00:00Z'), phase: 'BUILD', targetLoad: 100 }],
    });
    const proposals = [baseProposal({ date: '2026-07-14', load: 50 })];

    expect(weeklyLoadRule(context, proposals)).toEqual([]);
  });

  it('counts existing non-superseded sessions toward the same week total', () => {
    const context = baseContext({
      planWeeks: [{ weekStart: new Date('2026-07-13T00:00:00Z'), phase: 'BUILD', targetLoad: 100 }],
      existingSessions: [
        {
          id: 'existing-1',
          date: new Date('2026-07-15T00:00:00Z'),
          type: 'BIKE',
          intensity: 'ENDURANCE',
          completed: true,
          load: 80,
        },
      ],
    });
    const proposals = [baseProposal({ date: '2026-07-14', load: 50 })];

    expect(
      weeklyLoadRule(context, proposals).some((f) => f.ruleCode === 'WEEKLY_LOAD_EXCEEDED'),
    ).toBe(true);
  });

  it('excludes an existing session from the total when it is being MODIFIED by a proposal', () => {
    const context = baseContext({
      planWeeks: [{ weekStart: new Date('2026-07-13T00:00:00Z'), phase: 'BUILD', targetLoad: 100 }],
      existingSessions: [
        {
          id: 'existing-1',
          date: new Date('2026-07-15T00:00:00Z'),
          type: 'BIKE',
          intensity: 'ENDURANCE',
          completed: false,
          load: 80,
        },
      ],
    });
    const proposals = [
      baseProposal({ action: 'MODIFY', sessionId: 'existing-1', date: '2026-07-15', load: 20 }),
    ];

    expect(weeklyLoadRule(context, proposals)).toEqual([]);
  });

  it('bounds the first week of an athlete with no history by the sessions they asked for', () => {
    const context = baseContext({ declaredSessionsPerWeek: 2 });
    const within = [baseProposal({ date: '2026-07-14', load: 60 })];
    const beyond = [...within, baseProposal({ date: '2026-07-16', load: 90 })];

    expect(weeklyLoadRule(context, within)).toEqual([]);
    expect(weeklyLoadRule(context, beyond).map((f) => f.ruleCode)).toEqual([
      'WEEKLY_LOAD_EXCEEDED',
    ]);
  });
});
