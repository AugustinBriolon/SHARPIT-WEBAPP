/**
 * Reference running paces for coaching (Kotcha-style Z2 + threshold).
 * Zone 2 is stored when the athlete sets it; otherwise derived from threshold.
 */

/** ~15% slower than threshold — typical easy / Z2 when no explicit easy pace. */
export const ZONE2_FROM_THRESHOLD_FACTOR = 1.15;

export function deriveZone2PaceSecPerKm(
  thresholdPaceSecPerKm: number | null | undefined,
): number | null {
  if (typeof thresholdPaceSecPerKm !== 'number' || !Number.isFinite(thresholdPaceSecPerKm)) {
    return null;
  }
  if (thresholdPaceSecPerKm <= 0) {
    return null;
  }
  return Math.round(thresholdPaceSecPerKm * ZONE2_FROM_THRESHOLD_FACTOR);
}

export function resolveZone2PaceSecPerKm(input: {
  easyPaceSecPerKm?: number | null;
  thresholdPaceSecPerKm?: number | null;
}): { paceSecPerKm: number | null; source: 'declared' | 'derived' | null } {
  if (typeof input.easyPaceSecPerKm === 'number' && input.easyPaceSecPerKm > 0) {
    return { paceSecPerKm: input.easyPaceSecPerKm, source: 'declared' };
  }
  const derived = deriveZone2PaceSecPerKm(input.thresholdPaceSecPerKm);
  if (derived === null) {
    return { paceSecPerKm: null, source: null };
  }
  return { paceSecPerKm: derived, source: 'derived' };
}
