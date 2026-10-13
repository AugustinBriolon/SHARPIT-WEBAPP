import { describe, expect, it } from 'vitest';
import {
  mapAthleteProfileToFormData,
  shouldHydrateProfileForm,
} from '@sharpit/app/lib/profile/map-athlete-profile';

describe('mapAthleteProfileToFormData', () => {
  it('returns null when profile is missing (failed load / no row)', () => {
    expect(mapAthleteProfileToFormData(null)).toBeNull();
    expect(mapAthleteProfileToFormData(undefined)).toBeNull();
  });

  it('maps identity + sleep fields for the account form', () => {
    const mapped = mapAthleteProfileToFormData({
      heightCm: 185,
      targetWeightKg: 72.5,
      birthDate: new Date(Date.UTC(2001, 7, 30)),
      ftpW: null,
      maxHr: null,
      lthr: null,
      runThresholdPaceSecPerKm: null,
      runEasyPaceSecPerKm: null,
      vo2maxRunning: null,
      vo2maxCycling: null,
      thresholdsSyncedAt: null,
      sleepTargetMinutes: 480,
      sleepBedtimeTargetMin: 1380,
    });
    expect(mapped).toMatchObject({
      heightCm: 185,
      targetWeightKg: 72.5,
      birthDate: '2001-08-30',
      sleepTargetMinutes: 480,
      sleepBedtimeTargetMin: 1380,
    });
  });
});

describe('shouldHydrateProfileForm', () => {
  it('refuses null so a failed RSC load cannot wipe local fields', () => {
    expect(shouldHydrateProfileForm(null)).toBe(false);
    expect(shouldHydrateProfileForm(undefined)).toBe(false);
  });

  it('accepts a real snapshot', () => {
    expect(
      shouldHydrateProfileForm({
        heightCm: 185,
        targetWeightKg: null,
        birthDate: '2001-08-30',
        ftpW: null,
        maxHr: null,
        lthr: null,
        runThresholdPaceSecPerKm: null,
        runEasyPaceSecPerKm: null,
        defaultPoolLengthM: null,
        swimCssSecPer100m: null,
        vo2maxRunning: null,
        vo2maxCycling: null,
        thresholdsSyncedAt: null,
        sleepTargetMinutes: 480,
        sleepBedtimeTargetMin: 1380,
      }),
    ).toBe(true);
  });
});
