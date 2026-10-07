import { describe, expect, it } from 'vitest';
import {
  DATA_CLASSES,
  availableProvidersForClass,
  isProviderConnectable,
  oauthConnectHref,
  providersForClass,
  PROVIDER_CATALOG,
  visibleProvidersForClass,
} from './provider-catalog';

describe('provider-catalog', () => {
  it('lists five data classes', () => {
    expect(DATA_CLASSES.map((c) => c.id)).toEqual([
      'activities',
      'wearable_health',
      'body',
      'nutrition',
      'calendar',
    ]);
  });

  it('places Garmin under activities and wearable_health only', () => {
    const garmin = PROVIDER_CATALOG.find((p) => p.id === 'garmin');
    expect(garmin?.classes).toEqual(['activities', 'wearable_health']);
  });

  it('lists Strava under activities as available OAuth', () => {
    const strava = PROVIDER_CATALOG.find((p) => p.id === 'strava');
    expect(strava?.status).toBe('available');
    expect(strava?.authKind).toBe('oauth');
    expect(strava?.oauthPath).toBe('/api/strava/connect');
    expect(providersForClass('activities').map((p) => p.id)).toContain('strava');
    expect(providersForClass('wearable_health').map((p) => p.id)).not.toContain('strava');
  });

  it('makes Strava connectable for activities', () => {
    expect(visibleProvidersForClass('activities').map((p) => p.id)).toContain('strava');
    expect(availableProvidersForClass('activities').map((p) => p.id)).toContain('strava');
    expect(isProviderConnectable('strava')).toBe(true);
  });

  it('builds oauth href with optional dataClass', () => {
    expect(oauthConnectHref('/api/strava/connect', '/onboarding')).toBe(
      '/api/strava/connect?returnTo=%2Fonboarding',
    );
    expect(oauthConnectHref('/api/strava/connect', '/onboarding', 'activities')).toBe(
      '/api/strava/connect?returnTo=%2Fonboarding&dataClass=activities',
    );
  });

  it('lists Sharpit and Apple Santé for nutrition, not MyFitnessPal', () => {
    expect(PROVIDER_CATALOG.find((p) => p.id === 'myfitnesspal')).toBeUndefined();
    expect(providersForClass('nutrition').map((p) => p.id)).toEqual(
      expect.arrayContaining(['sharpit', 'apple-health']),
    );
    expect(isProviderConnectable('sharpit')).toBe(false);
  });
});
