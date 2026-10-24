import { describe, expect, it } from 'vitest';
import { resolveSourcePrefs } from '@sharpit/app/lib/integrations/source-prefs';
import { appleHealthPatch, appleHealthPolicy, type AppleHealthPolicy } from './apple-health-merge';

const night = {
  date: '2026-09-21',
  sleepMinutes: 432,
  sleepDeepMin: 70,
  sleepRemMin: 95,
  sleepLightMin: 267,
  sleepBedtimeMin: 1400,
  sleepWakeMin: 412,
};

const alone: AppleHealthPolicy = { health: 'fill', body: 'fill', garminHrv: false };
const beside: AppleHealthPolicy = { health: 'fill', body: 'fill', garminHrv: true };
const owning: AppleHealthPolicy = { health: 'own', body: 'own', garminHrv: true };

describe('appleHealthPatch', () => {
  it('fills an empty day', () => {
    expect(appleHealthPatch(null, { ...night, restingHr: 48, totalSteps: 9000 }, alone)).toEqual({
      ...night,
      date: undefined,
      sleepAwakeMin: null,
      restingHr: 48,
      totalSteps: 9000,
    });
  });

  it('never overwrites what the primary source already wrote', () => {
    expect(
      appleHealthPatch({ sleepMinutes: 351, restingHr: 47 }, { ...night, restingHr: 52 }, beside),
    ).toEqual({});
  });

  it('owns the day when it is the primary: its night whole, its heart, its weight', () => {
    const patch = appleHealthPatch(
      { sleepMinutes: 351, sleepAwakeMin: 30, restingHr: 47, hrv: 80, weightKg: 71 },
      { ...night, restingHr: 52, hrv: 61, weightKg: 72.4 },
      owning,
    );
    expect(patch).toMatchObject({
      sleepMinutes: 432,
      sleepAwakeMin: null,
      restingHr: 52,
      hrv: 61,
      weightKg: 72.4,
    });
  });

  it('keeps Apple HRV out beside Garmin unless Apple owns the class', () => {
    expect(appleHealthPatch(null, { date: '2026-09-21', hrv: 62 }, beside)).toEqual({});
    expect(appleHealthPatch(null, { date: '2026-09-21', hrv: 62 }, alone)).toEqual({ hrv: 62 });
  });

  it('writes nothing for a class Apple Health is off for', () => {
    const offHealth: AppleHealthPolicy = { health: 'off', body: 'fill', garminHrv: false };
    expect(appleHealthPatch(null, { ...night, restingHr: 48, weightKg: 72 }, offHealth)).toEqual({
      weightKg: 72,
    });
  });

  it('ignores an empty night', () => {
    expect(appleHealthPatch(null, { date: '2026-09-21', sleepMinutes: 0 }, alone)).toEqual({});
  });
});

describe('appleHealthPolicy', () => {
  it('fills beside Garmin by default and owns the classes it is primary for', () => {
    const prefs = resolveSourcePrefs(null, ['garmin', 'apple-health']);
    expect(appleHealthPolicy(prefs)).toEqual({ health: 'fill', body: 'own', garminHrv: true });

    prefs.classes.wearable_health.primary = 'apple-health';
    expect(appleHealthPolicy(prefs).health).toBe('own');

    prefs.classes.body.enabled = [];
    expect(appleHealthPolicy(prefs).body).toBe('off');
  });
});
