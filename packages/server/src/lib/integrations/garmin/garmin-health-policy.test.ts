import { describe, expect, it } from 'vitest';
import { resolveSourcePrefs } from '@sharpit/app/lib/integrations/source-prefs';
import { garminHealthWrite, restrictGarminHealthUpdate } from './garmin-health-policy';

const update = {
  sleepMinutes: 420,
  sleepDeepMin: 60,
  restingHr: 46,
  hrv: 72,
  hrvBaselineLow: 60,
  hrvBaselineHigh: 85,
  hrvStatus: 'BALANCED',
  totalSteps: 9_000,
  bodyBattery: 80,
  recoveryScore: 71,
};

describe('garminHealthWrite', () => {
  it('owns the class by default, fills behind Apple Health, stays out when off', () => {
    const prefs = resolveSourcePrefs(null, ['garmin', 'apple-health']);
    expect(garminHealthWrite(prefs)).toBe('own');
    prefs.classes.wearable_health.primary = 'apple-health';
    expect(garminHealthWrite(prefs)).toBe('fill');
    prefs.classes.wearable_health.enabled = ['apple-health'];
    expect(garminHealthWrite(prefs)).toBe('off');
  });
});

describe('restrictGarminHealthUpdate', () => {
  it('writes everything while Garmin owns the class', () => {
    expect(restrictGarminHealthUpdate(update, { sleepMinutes: 380 }, 'own')).toEqual(update);
  });

  it('behind Apple Health, fills only the gaps, the night and HRV as blocks', () => {
    const next = restrictGarminHealthUpdate(
      update,
      { sleepMinutes: 380, hrv: 55, restingHr: null },
      'fill',
    );
    expect(next).toEqual({ restingHr: 46, totalSteps: 9_000, bodyBattery: 80, recoveryScore: 71 });
  });

  it('keeps only its own readings when it is off for the class', () => {
    expect(restrictGarminHealthUpdate(update, null, 'off')).toEqual({
      bodyBattery: 80,
      recoveryScore: 71,
    });
  });
});
