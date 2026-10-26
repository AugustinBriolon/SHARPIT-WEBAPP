import { describe, expect, it } from 'vitest';
import { strengthFrequencyRule } from './strength-frequency';
import { baseContext, baseProposal } from '../test-fixtures';

// Monday 2026-07-20 → Sunday 2026-07-26.
const fullWeek = { start: new Date('2026-07-20T00:00:00'), days: 7 };
const strength = (date: string, durationMin = 45) =>
  baseProposal({ date, type: 'STRENGTH', intensity: null, durationMin, title: 'Renfo' });

describe('strengthFrequencyRule', () => {
  it('warns when a generated week holds fewer than two structured strength sessions', () => {
    const findings = strengthFrequencyRule(baseContext({ planWindow: fullWeek }), [
      baseProposal({ date: '2026-07-21' }),
      strength('2026-07-22'),
    ]);

    expect(findings.map((f) => f.ruleCode)).toEqual(['STRENGTH_DOSE_LOW']);
  });

  it('does not count a short mobility filler as renfo', () => {
    const findings = strengthFrequencyRule(baseContext({ planWindow: fullWeek }), [
      strength('2026-07-22'),
      strength('2026-07-24', 15),
    ]);

    expect(findings).toHaveLength(1);
  });

  it('is silent with two structured sessions, counting existing ones', () => {
    const context = baseContext({
      planWindow: fullWeek,
      existingSessions: [
        {
          id: 's1',
          date: new Date('2026-07-23T00:00:00'),
          type: 'STRENGTH',
          intensity: null,
          completed: false,
          load: 30,
          durationMin: 50,
        },
      ],
    });

    expect(strengthFrequencyRule(context, [strength('2026-07-21')])).toEqual([]);
  });

  it('asks for one session in a taper week', () => {
    const context = baseContext({
      planWindow: fullWeek,
      planWeeks: [{ weekStart: new Date('2026-07-20T00:00:00'), phase: 'TAPER', targetLoad: 200 }],
    });

    expect(strengthFrequencyRule(context, [strength('2026-07-21')])).toEqual([]);
  });

  it('skips targeted adaptations, partial weeks, strength-only athletes and rest-only days', () => {
    const none: never[] = [];
    expect(strengthFrequencyRule(baseContext(), none)).toEqual([]);
    expect(
      strengthFrequencyRule(
        baseContext({ planWindow: { start: new Date('2026-07-24T00:00:00'), days: 3 } }),
        none,
      ),
    ).toEqual([]);
    expect(
      strengthFrequencyRule(
        baseContext({ planWindow: fullWeek, practicedSports: ['strength'] }),
        none,
      ),
    ).toEqual([]);
    expect(
      strengthFrequencyRule(
        baseContext({ planWindow: fullWeek, fatigueTrainingCapacity: 'REST_ONLY' }),
        none,
      ),
    ).toEqual([]);
  });
});
