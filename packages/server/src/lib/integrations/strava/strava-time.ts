import { appleHealthWallClockStart } from '@sharpit/server/lib/integrations/apple-health/apple-health-time';

/**
 * Strava start as SharpIt stores activity starts: athlete wall-clock written as UTC
 * (same convention as Garmin `startTimeLocal` and Apple Health).
 *
 * Strava's `start_date` is a real UTC instant. Its `start_date_local` carries the local
 * wall digits — often with a trailing `Z` that does **not** mean UTC. Fingerprinting on
 * `start_date` alone missed Apple Health / Garmin rows by the timezone offset (~1–2h),
 * so the same run was imported twice.
 */

const ISO_WALL =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3})\d*)?(?:Z|[+-]\d{2}:?\d{2})?$/;

/** Wall-clock digits from a Strava local timestamp, stored as a UTC-encoded Date. */
export function stravaLocalWallClockAsUtc(startDateLocal: string): Date | null {
  const match = ISO_WALL.exec(startDateLocal.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, millis] = match;
  const ms = Number((millis ?? '0').padEnd(3, '0'));
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      ms,
    ),
  );
}

/**
 * Prefer `start_date_local` wall digits; fall back to projecting `start_date` into the
 * athlete's timezone (same path as Apple Health when the offset is lost).
 */
export function stravaWallClockStart(
  activity: { start_date: string; start_date_local?: string | null },
  fallbackTimeZone: string,
): Date {
  const local = activity.start_date_local?.trim();
  if (local) {
    const fromLocal = stravaLocalWallClockAsUtc(local);
    if (fromLocal) {
      return fromLocal;
    }
  }
  return appleHealthWallClockStart(activity.start_date, fallbackTimeZone);
}
