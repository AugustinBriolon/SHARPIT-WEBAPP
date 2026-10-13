/** Gap between consecutive activities of a chain — used to detect triathlons and brick sessions. */

type Timed = { date: Date | string; duration?: number | null };

function activityStartMs(activity: Pick<Timed, 'date'>): number {
  return new Date(activity.date).getTime();
}

export function brickGapSec(prev: Timed, curr: Pick<Timed, 'date'>): number {
  return Math.round(
    (activityStartMs(curr) - (activityStartMs(prev) + (prev.duration ?? 0) * 1000)) / 1000,
  );
}

export function isValidBrickGap(gapSec: number): boolean {
  return gapSec >= 30 && gapSec <= 20 * 60;
}
