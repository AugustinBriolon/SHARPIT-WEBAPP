import { describe, expect, it } from 'vitest';
import {
  disableProviderForClass,
  enableProviderForClass,
  emptySourcePrefs,
  isProviderEnabledForClass,
  legacyDefaultsFromConnected,
  parseSourcePrefs,
  removeProviderEverywhere,
  resolveSourcePrefs,
  setPrimaryForClass,
} from './source-prefs';

describe('source-prefs', () => {
  it('legacy defaults enable all classes a connected Garmin covers', () => {
    const prefs = legacyDefaultsFromConnected(['garmin']);
    expect(prefs.classes.activities).toEqual({ primary: 'garmin', enabled: ['garmin'] });
    expect(prefs.classes.wearable_health).toEqual({ primary: 'garmin', enabled: ['garmin'] });
    expect(prefs.classes.body.enabled).toEqual([]);
  });

  it('legacy body prefers Withings over Renpho', () => {
    const prefs = legacyDefaultsFromConnected(['renpho', 'withings']);
    expect(prefs.classes.body.primary).toBe('withings');
    expect(prefs.classes.body.enabled).toEqual(['renpho', 'withings']);
  });

  it('enableProviderForClass activates only that class', () => {
    let prefs = emptySourcePrefs();
    prefs = enableProviderForClass(prefs, 'activities', 'garmin');
    expect(prefs.classes.activities).toEqual({ primary: 'garmin', enabled: ['garmin'] });
    expect(prefs.classes.wearable_health.enabled).toEqual([]);
    expect(isProviderEnabledForClass(prefs, 'wearable_health', 'garmin')).toBe(false);
  });

  it('enableProviderForAllCoveredClasses enables every class Garmin covers', async () => {
    const { enableProviderForAllCoveredClasses } = await import('./source-prefs');
    let prefs = emptySourcePrefs();
    prefs = enableProviderForAllCoveredClasses(prefs, 'garmin');
    expect(prefs.classes.activities.enabled).toContain('garmin');
    expect(prefs.classes.wearable_health.enabled).toContain('garmin');
  });

  it('disable primary promotes the next enabled provider', () => {
    let prefs = emptySourcePrefs();
    prefs = enableProviderForClass(prefs, 'activities', 'garmin');
    prefs = enableProviderForClass(prefs, 'activities', 'strava');
    prefs = setPrimaryForClass(prefs, 'activities', 'garmin');
    prefs = disableProviderForClass(prefs, 'activities', 'garmin');
    expect(prefs.classes.activities).toEqual({ primary: 'strava', enabled: ['strava'] });
  });

  it('setPrimaryForClass adds provider to enabled if missing', () => {
    let prefs = emptySourcePrefs();
    prefs = setPrimaryForClass(prefs, 'body', 'withings');
    expect(prefs.classes.body).toEqual({ primary: 'withings', enabled: ['withings'] });
  });

  it('removeProviderEverywhere clears all classes', () => {
    let prefs = emptySourcePrefs();
    prefs = enableProviderForClass(prefs, 'activities', 'garmin');
    prefs = enableProviderForClass(prefs, 'wearable_health', 'garmin');
    prefs = removeProviderEverywhere(prefs, 'garmin');
    expect(prefs.classes.activities.enabled).toEqual([]);
    expect(prefs.classes.wearable_health.enabled).toEqual([]);
  });

  it('resolveSourcePrefs falls back to legacy when raw is null', () => {
    const prefs = resolveSourcePrefs(null, ['strava', 'withings']);
    expect(prefs.classes.activities.primary).toBe('strava');
    expect(prefs.classes.body.primary).toBe('withings');
  });

  it('legacy nutrition prefers Sharpit then Apple Santé', () => {
    const prefs = legacyDefaultsFromConnected(['sharpit', 'apple-health']);
    expect(prefs.classes.nutrition).toEqual({
      primary: 'sharpit',
      enabled: ['sharpit', 'apple-health'],
    });
  });

  it('parseSourcePrefs rejects invalid shapes', () => {
    expect(parseSourcePrefs({})).toBeNull();
    expect(parseSourcePrefs({ version: 2, classes: {} })).toBeNull();
  });

  it('resolveSourcePrefs drops disconnected providers', () => {
    const raw = {
      version: 1,
      classes: {
        activities: { primary: 'garmin', enabled: ['garmin', 'strava'] },
        wearable_health: { primary: null, enabled: [] },
        body: { primary: null, enabled: [] },
        nutrition: { primary: null, enabled: [] },
        calendar: { primary: null, enabled: [] },
      },
    };
    const prefs = resolveSourcePrefs(raw, ['strava']);
    expect(prefs.classes.activities).toEqual({ primary: 'strava', enabled: ['strava'] });
  });
});
