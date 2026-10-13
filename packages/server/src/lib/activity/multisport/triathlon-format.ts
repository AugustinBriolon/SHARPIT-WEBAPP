import { TRIATHLON_LETTER_DISTANCES } from '@sharpit/app/lib/goals/race-formats';

// XL (between L and the full distance) has no single reference distance, so none is drawn here.
export type TriathlonDistanceFormat = 'XS' | 'S' | 'M' | 'L' | 'XXL';

export type TriathlonLegDistancesM = {
  swim: number | null;
  bike: number | null;
  run: number | null;
};

/** French federation reference distances (km): swim / bike / run, from the race-format catalog. */
const FORMATS: ReadonlyArray<{
  format: TriathlonDistanceFormat;
  swim: number;
  bike: number;
  run: number;
}> = TRIATHLON_LETTER_DISTANCES.map((ref) => ({
  format: ref.letter,
  swim: ref.swimM / 1000,
  bike: ref.bikeM / 1000,
  run: ref.runM / 1000,
}));

/** Mean |log ratio| above which no format is close enough (≈ ×1.5 off on average). */
const MAX_MEAN_LOG_RATIO = Math.log(1.5);

function legsKm(distances: TriathlonLegDistancesM) {
  return (['swim', 'bike', 'run'] as const)
    .map((leg) => ({ leg, km: (distances[leg] ?? 0) / 1000 }))
    .filter((entry) => entry.km > 0);
}

/**
 * Nearest official format by mean log-ratio over the legs that carry a distance
 * (log so a 400 m swim weighs like a 10 km bike). Null with fewer than two legs or when far from all.
 */
export function nearestTriathlonFormat(
  distances: TriathlonLegDistancesM,
): TriathlonDistanceFormat | null {
  const legs = legsKm(distances);
  if (legs.length < 2) {
    return null;
  }
  let best: { format: TriathlonDistanceFormat; score: number } | null = null;
  for (const ref of FORMATS) {
    const score =
      legs.reduce((sum, { leg, km }) => sum + Math.abs(Math.log(km / ref[leg])), 0) / legs.length;
    if (!best || score < best.score) {
      best = { format: ref.format, score };
    }
  }
  return best && best.score <= MAX_MEAN_LOG_RATIO ? best.format : null;
}

export const TRIATHLON_TITLE = 'Triathlon';

/** "Triathlon M", or plain "Triathlon" when the distances fit no format. */
export function triathlonTitle(distances: TriathlonLegDistancesM): string {
  const format = nearestTriathlonFormat(distances);
  return format ? `${TRIATHLON_TITLE} ${format}` : TRIATHLON_TITLE;
}
