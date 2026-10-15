import { describe, expect, it } from 'vitest';
import { buildTodayLimitingFacts } from './today-instrument-facts';

describe('today-instrument-facts', () => {
  it('buildTodayLimitingFacts keeps frein + cause only', () => {
    const { facts, emptyText, limiterSignal } = buildTodayLimitingFacts({
      limitingFactor: {
        system: 'RECOVERY',
        actionable: true,
        description: {
          code: 'reasoning.limitingFactor.recovery.deficit',
          params: { limiter: 'loadContext' },
        },
      },
      recovery: {
        primaryLimitingFactor: 'loadContext',
      } as never,
    });

    expect(emptyText).toBeNull();
    expect(facts).toEqual([
      { label: 'Frein', value: 'Récupération' },
      { label: 'Cause', value: 'Charge élevée' },
    ]);
    expect(limiterSignal).toEqual({ code: 'load_elevated', label: 'Charge élevée' });
  });
});
