import { describe, expect, it } from 'vitest';
import {
  LIMITER_SIGNAL_BY_DIMENSION,
  LIMITER_SIGNAL_CODES,
  limiterSignalChip,
  resolveLimiterSignal,
} from './limiter-signal';

describe('resolveLimiterSignal', () => {
  it('names VFC when autonomic and HRV is below baseline', () => {
    expect(
      resolveLimiterSignal({
        primaryLimitingFactor: 'autonomic',
        hints: { hrv: 40, hrvBaselineLow: 50, hrvBaselineHigh: 70 },
      }),
    ).toEqual({ code: 'hrv_low', label: 'VFC basse' });
  });

  it('names FC repos when HRV is in band but resting HR is elevated', () => {
    expect(
      resolveLimiterSignal({
        primaryLimitingFactor: 'autonomic',
        hints: {
          hrv: 60,
          hrvBaselineLow: 50,
          hrvBaselineHigh: 70,
          restingHr: 58,
          restingHrTypical: 48,
        },
      }),
    ).toEqual({ code: 'rhr_high', label: 'FC au repos élevée' });
  });

  it('names sommeil court when sleep duration is under target', () => {
    expect(
      resolveLimiterSignal({
        primaryLimitingFactor: 'sleep',
        hints: { sleepMinutes: 5 * 60, sleepTargetMinutes: 8 * 60 },
      }),
    ).toEqual({ code: 'sleep_short', label: 'Sommeil court' });
  });

  it('names sommeil fragmenté when duration is ok but restorative ratio is poor', () => {
    expect(
      resolveLimiterSignal({
        primaryLimitingFactor: 'sleep',
        hints: {
          sleepMinutes: 8 * 60,
          sleepTargetMinutes: 8 * 60,
          sleepDeepMin: 20,
          sleepRemMin: 20,
        },
      }),
    ).toEqual({ code: 'sleep_poor', label: 'Sommeil fragmenté' });
  });

  it('covers subjective and load without inventing VFC basse', () => {
    expect(resolveLimiterSignal({ primaryLimitingFactor: 'subjective' })).toEqual({
      code: 'subjective_low',
      label: 'Ressenti bas',
    });
    expect(resolveLimiterSignal({ primaryLimitingFactor: 'loadContext' })).toEqual({
      code: 'load_elevated',
      label: 'Charge élevée',
    });
    expect(resolveLimiterSignal({ primaryLimitingFactor: 'subjective' })?.label).not.toBe(
      'VFC basse',
    );
    expect(resolveLimiterSignal({ primaryLimitingFactor: 'loadContext' })?.label).not.toBe(
      'VFC basse',
    );
  });

  it('returns null when there is no recovery primary limiter', () => {
    expect(resolveLimiterSignal({ primaryLimitingFactor: null })).toBeNull();
  });

  it('exposes every dimension’s signal codes for API clients', () => {
    const all = Object.values(LIMITER_SIGNAL_BY_DIMENSION).flat();
    expect(new Set(all)).toEqual(new Set(LIMITER_SIGNAL_CODES));
  });

  it('builds the Frein chip without jargon', () => {
    for (const code of LIMITER_SIGNAL_CODES) {
      const chip = limiterSignalChip(code);
      expect(chip.startsWith('Frein · ')).toBe(true);
      expect(chip).not.toMatch(/système autonome|\{|\}/i);
    }
  });
});
