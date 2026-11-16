import {
  bloodMarker,
  type BloodMarkerResult,
  type BloodMarkerStatus,
} from '@sharpit/app/lib/blood-markers/catalog';

/** A blood test as `/api/v1/blood-tests` sends it: results already read against their range. */
export type BloodTestReading = {
  id: string;
  sampledAt: string;
  results: (BloodMarkerResult & { status: BloodMarkerStatus })[];
};

export type MarkerRow = {
  key: string;
  label: string;
  value: number;
  unit: string;
  status: BloodMarkerStatus;
  refLow: number | null;
  refHigh: number | null;
  /**
   * Where the value sits on the row's bar, in percent: the lab's range spans 25 to 75, so a value
   * under or over it shows outside the band. Null without both bounds.
   */
  position: number | null;
  /** The marker's values across the tests, oldest first: the row's trend. */
  history: number[];
};

const BAND_START = 25;
const BAND_SPAN = 50;

function positionOf(result: BloodMarkerResult): number | null {
  if (result.refLow === null || result.refHigh === null || result.refHigh <= result.refLow) {
    return null;
  }
  const inBand = (result.value - result.refLow) / (result.refHigh - result.refLow);
  return Math.min(98, Math.max(2, BAND_START + inBand * BAND_SPAN));
}

/**
 * One row a marker, in the order of the latest test that measured it: its latest value read
 * against that test's own range, and every value it took, oldest first.
 */
export function markerRows(tests: readonly BloodTestReading[]): MarkerRow[] {
  const latestFirst = [...tests].sort((a, b) => b.sampledAt.localeCompare(a.sampledAt));
  const rows = new Map<string, MarkerRow>();
  for (const test of latestFirst) {
    for (const result of test.results) {
      const row = rows.get(result.markerKey);
      if (row) {
        row.history.unshift(result.value);
        continue;
      }
      rows.set(result.markerKey, {
        key: result.markerKey,
        label: bloodMarker(result.markerKey)?.label ?? result.markerKey,
        value: result.value,
        unit: result.unit,
        status: result.status,
        refLow: result.refLow,
        refHigh: result.refHigh,
        position: positionOf(result),
        history: [result.value],
      });
    }
  }
  return [...rows.values()];
}

/** A trend as an SVG polyline in a `width` × `height` box; empty under two values. */
export function sparkline(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) {
    return '';
  }
  const low = Math.min(...values);
  const range = Math.max(...values) - low || 1;
  const pad = 2;
  return values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - pad - ((value - low) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
