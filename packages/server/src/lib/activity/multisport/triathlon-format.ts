export type TriathlonDistanceFormat = 'XS' | 'S' | 'M' | 'L' | 'XL';

export type TriathlonLegDistancesM = {
  swim: number | null;
  bike: number | null;
  run: number | null;
};

/** French federation reference distances (km): swim / bike / run. */
const FORMATS: ReadonlyArray<{
  format: TriathlonDistanceFormat;
  swim: number;
  bike: number;
  run: number;
}> = [
  { format: 'XS', swim: 0.4, bike: 10, run: 2.5 },
  { format: 'S', swim: 0.75, bike: 20, run: 5 },
  { format: 'M', swim: 1.5, bike: 40, run: 10 },
  { format: 'L', swim: 1.9, bike: 90, run: 21.1 },
  { format: 'XL', swim: 3.8, bike: 180, run: 42.2 },
];

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
