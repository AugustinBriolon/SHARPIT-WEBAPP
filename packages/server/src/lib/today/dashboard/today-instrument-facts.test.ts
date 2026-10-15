import { describe, expect, it } from 'vitest';
import { buildTodayLimitingFacts } from './today-instrument-facts';

describe('today-instrument-facts', () => {
  it('buildTodayLimitingFacts keeps frein + cause only', () => {
    const { facts, emptyText } = buildTodayLimitingFacts({
      limitingFactor: {
        system: 'RECOVERY',
        actionable: true,
        description: {
          code: 'reasoning.limitingFactor.recovery.deficit',
          params: { limiter: 'loadContext' },
        },
      },
    });

    expect(emptyText).toBeNull();
    expect(facts).toEqual([
      { label: 'Frein', value: 'Récupération' },
      { label: 'Cause', value: "Charge d'entraînement" },
    ]);
  });
});
