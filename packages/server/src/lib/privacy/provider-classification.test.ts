import { describe, expect, it } from 'vitest';
import {
  providerConnectRequirements,
  providerFeedsHealthData,
  providerIsUnofficial,
} from '@sharpit/server/lib/privacy/provider-classification';

describe('providerConnectRequirements', () => {
  it('requires health + unofficial for Garmin', () => {
    expect(providerConnectRequirements('garmin')).toEqual({
      needsHealthConsent: true,
      needsUnofficialAck: true,
    });
  });

  it('requires neither for Strava (activities OAuth)', () => {
    expect(providerConnectRequirements('strava')).toEqual({
      needsHealthConsent: false,
      needsUnofficialAck: false,
    });
  });

  it('requires health only for Withings', () => {
    expect(providerConnectRequirements('withings')).toEqual({
      needsHealthConsent: true,
      needsUnofficialAck: false,
    });
  });

  it('requires neither for Google calendar', () => {
    expect(providerConnectRequirements('google')).toEqual({
      needsHealthConsent: false,
      needsUnofficialAck: false,
    });
  });

  it('classifies Renpho as an unofficial health feeder', () => {
    expect(providerFeedsHealthData('renpho')).toBe(true);
    expect(providerIsUnofficial('renpho')).toBe(true);
  });

  it('treats the in-app Sharpit log as official nutrition', () => {
    expect(providerFeedsHealthData('sharpit')).toBe(true);
    expect(providerIsUnofficial('sharpit')).toBe(false);
  });
});
