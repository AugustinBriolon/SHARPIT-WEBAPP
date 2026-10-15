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

  it('never emits a raw Signaux frein — uses the #154 chip when signals exist', () => {
    const { facts, emptyText } = buildTodayLimitingFacts({
      limitingFactor: {
        system: null,
        actionable: true,
        description: {
          code: 'reasoning.limitingFactor.recovery.deficit',
          params: { limiter: 'sleep' },
        },
      },
      limiterSignals: ['sleep_short'],
    });

    expect(emptyText).toBeNull();
    expect(facts).toEqual([
      { label: 'Frein', value: 'Nuit trop courte' },
      { label: 'Cause', value: 'Sommeil' },
    ]);
    expect(facts.some((fact) => fact.value === 'Signaux')).toBe(false);
  });

  it('shows N signaux from 2 freins up (essentiel count label)', () => {
    const { facts } = buildTodayLimitingFacts({
      limitingFactor: {
        system: null,
        actionable: true,
        description: { code: 'reasoning.limitingFactor.recovery.deficit', params: {} },
      },
      limiterSignals: ['hrv_low', 'sleep_short'],
      limiterCountLabel: '2 signaux',
    });

    expect(facts.find((fact) => fact.label === 'Frein')?.value).toBe('2 signaux');
  });

  it('omits Frein when system is unknown and no limiter signals', () => {
    const { facts, emptyText } = buildTodayLimitingFacts({
      limitingFactor: {
        system: null,
        actionable: true,
        description: {
          code: 'reasoning.limitingFactor.recovery.deficit',
          params: { limiter: 'sleep' },
        },
      },
    });

    expect(facts).toEqual([{ label: 'Cause', value: 'Sommeil' }]);
    expect(emptyText).toBeNull();
    expect(facts.some((fact) => fact.value === 'Signaux')).toBe(false);
  });
});
