import { isSet } from '@sharpit/shared/value';
/**
 * Pick the Body Battery level that matches Garmin Connect’s “current” reading.
 *
 * Daily stress payloads expose either an explicit most-recent value and/or a
 * chronological `bodyBatteryValuesArray`. Historical SHARPIT took the MAX of
 * the series (morning peak), which diverges from the watch/app current value.
 */

export type GarminBodyBatteryPayload = {
  bodyBatteryMostRecentValue?: number | null;
  bodyBatteryValuesArray?: Array<Array<number | string>> | null;
};

function finiteLevel(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return null;
  }
  return Math.round(n);
}

/** Level from one array entry — supports [ts, level] and [ts, status, level, version]. */
function levelFromEntry(entry: Array<number | string> | null | undefined): number | null {
  if (!entry || entry.length === 0) {
    return null;
  }
  if (entry.length === 2) {
    return finiteLevel(entry[1]);
  }
  return finiteLevel(entry[2]);
}

/**
 * Prefer Garmin’s most-recent scalar; otherwise the last valid sample in the day series.
 */
export function pickCurrentBodyBattery(
  payload: GarminBodyBatteryPayload | null | undefined,
): number | null {
  if (!payload) {
    return null;
  }

  const recent = finiteLevel(payload.bodyBatteryMostRecentValue);
  if (isSet(recent)) {
    return recent;
  }

  let last: number | null = null;
  for (const entry of payload.bodyBatteryValuesArray ?? []) {
    const level = levelFromEntry(entry);
    if (isSet(level)) {
      last = level;
    }
  }
  return last;
}
