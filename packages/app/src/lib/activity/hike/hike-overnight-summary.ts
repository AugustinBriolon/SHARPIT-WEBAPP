import { isSet } from '@sharpit/shared/value';
// Single-session overnight/day window.

const OVERNIGHT_DURATION_SEC = 8 * 3600;

export type HikeOvernightSummary = {
  variant: 'overnight' | 'day';
  startAt: Date;
  endAt: Date;
  durationSec: number | null;
  locationLabel: string | null;
  weather: string | null;
  load: number | null;
  distanceM: number | null;
  elevationM: number | null;
  elevationLossM: number | null;
  endPoint: { lat: number; lng: number } | null;
  endLocationFallback: string | null;
};

export type HikeOvernightInput = {
  date: Date | string;
  duration: number | null;
  weather: string | null;
  load: number | null;
  observedLocationLabel: string | null;
  hikeMetrics: {
    distanceM: number | null;
    elevationM: number | null;
    elevationLossM: number | null;
  } | null;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function crossesLocalMidnight(start: Date, end: Date): boolean {
  return (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  );
}

function resolveHikeVariant(
  durationSec: number | null,
  startAt: Date,
  endAt: Date,
): 'overnight' | 'day' {
  if (durationSec === undefined || durationSec === null) {
    return 'day';
  }
  if (durationSec >= OVERNIGHT_DURATION_SEC) {
    return 'overnight';
  }
  return crossesLocalMidnight(startAt, endAt) ? 'overnight' : 'day';
}

function endPointFromPath(
  path: [number, number][] | null | undefined,
): { lat: number; lng: number } | null {
  const last = path && path.length > 0 ? path[path.length - 1] : null;
  return last ? { lat: last[0], lng: last[1] } : null;
}

function resolveElevationLossM(
  metrics: HikeOvernightInput['hikeMetrics'],
  streamElevationLossM: number | null | undefined,
): number | null {
  return metrics?.elevationLossM ?? streamElevationLossM ?? null;
}

function buildOvernightFields(input: {
  activity: HikeOvernightInput;
  opts?: { path?: [number, number][] | null; streamElevationLossM?: number | null };
  startAt: Date;
  endAt: Date;
  durationSec: number | null;
}): Omit<HikeOvernightSummary, 'variant'> {
  const metrics = input.activity.hikeMetrics;
  return {
    startAt: input.startAt,
    endAt: input.endAt,
    durationSec: input.durationSec,
    locationLabel: input.activity.observedLocationLabel,
    weather: input.activity.weather,
    load: input.activity.load,
    distanceM: metrics?.distanceM ?? null,
    elevationM: metrics?.elevationM ?? null,
    elevationLossM: resolveElevationLossM(metrics, input.opts?.streamElevationLossM),
    endPoint: endPointFromPath(input.opts?.path),
    endLocationFallback: input.activity.observedLocationLabel,
  };
}

export function buildHikeOvernightSummary(
  activity: HikeOvernightInput,
  opts?: {
    path?: [number, number][] | null;
    streamElevationLossM?: number | null;
  },
): HikeOvernightSummary {
  const startAt = asDate(activity.date);
  const durationSec = isSet(activity.duration) && activity.duration > 0 ? activity.duration : null;
  const endAt = isSet(durationSec)
    ? new Date(startAt.getTime() + durationSec * 1000)
    : new Date(startAt);

  return {
    variant: resolveHikeVariant(durationSec, startAt, endAt),
    ...buildOvernightFields({ activity, opts, startAt, endAt, durationSec }),
  };
}
