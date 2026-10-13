import { birthDateToInput } from '@sharpit/app/lib/profile/athlete-profile-utils';
import { isSet } from '@sharpit/shared/value';

/** Shape consumed by settings / progression profile forms. */
export type AthleteProfileFormData = {
  heightCm: number | null;
  targetWeightKg: number | null;
  birthDate: string | null;
  ftpW: number | null;
  maxHr: number | null;
  lthr: number | null;
  runThresholdPaceSecPerKm: number | null;
  runEasyPaceSecPerKm: number | null;
  swimCssSecPer100m: number | null;
  defaultPoolLengthM: number | null;
  vo2maxRunning: number | null;
  vo2maxCycling: number | null;
  thresholdsSyncedAt: string | null;
  sleepTargetMinutes: number | null;
  sleepBedtimeTargetMin: number | null;
};

type ProfileRow = {
  heightCm?: number | null;
  targetWeightKg?: number | null;
  birthDate?: Date | string | null;
  ftpW?: number | null;
  maxHr?: number | null;
  lthr?: number | null;
  runThresholdPaceSecPerKm?: number | null;
  runEasyPaceSecPerKm?: number | null;
  swimCssSecPer100m?: number | null;
  defaultPoolLengthM?: number | null;
  vo2maxRunning?: number | null;
  vo2maxCycling?: number | null;
  thresholdsSyncedAt?: Date | string | null;
  sleepTargetMinutes?: number | null;
  sleepBedtimeTargetMin?: number | null;
};

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.toISOString();
}

function asNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

/** Map a Prisma / API athlete profile row into form-ready data. */
export function mapAthleteProfileToFormData(
  profile: ProfileRow | null | undefined,
): AthleteProfileFormData | null {
  if (!profile) {
    return null;
  }
  return {
    heightCm: asNull(profile.heightCm),
    targetWeightKg: asNull(profile.targetWeightKg),
    birthDate: birthDateToInput(profile.birthDate),
    ftpW: asNull(profile.ftpW),
    maxHr: asNull(profile.maxHr),
    lthr: asNull(profile.lthr),
    runThresholdPaceSecPerKm: asNull(profile.runThresholdPaceSecPerKm),
    runEasyPaceSecPerKm: asNull(profile.runEasyPaceSecPerKm),
    swimCssSecPer100m: asNull(profile.swimCssSecPer100m),
    defaultPoolLengthM: asNull(profile.defaultPoolLengthM),
    vo2maxRunning: asNull(profile.vo2maxRunning),
    vo2maxCycling: asNull(profile.vo2maxCycling),
    thresholdsSyncedAt: toIsoOrNull(profile.thresholdsSyncedAt),
    sleepTargetMinutes: asNull(profile.sleepTargetMinutes),
    sleepBedtimeTargetMin: asNull(profile.sleepBedtimeTargetMin),
  };
}

/**
 * Decide whether a new `initial` snapshot should overwrite local form state.
 * Null/undefined means load failed or pending — never wipe fields the athlete already sees.
 */
export function shouldHydrateProfileForm(
  initial: AthleteProfileFormData | null | undefined,
): initial is AthleteProfileFormData {
  return isSet(initial);
}
