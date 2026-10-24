import type { GarminPersonalClient } from '@sharpit/server/lib/integrations/garmin/garmin-personal-api';
import { isSet } from '@sharpit/shared/value';

type GCClient = GarminPersonalClient;

const GARMIN_ACTIVITY_BASE = '/activity-service/activity';

/** Séries brutes alignées sur le format Strava / streams.ts */
export interface RawStreams {
  time: number[];
  distance: number[];
  altitude: number[];
  heartrate: number[];
  watts: number[];
  cadence: number[];
  velocity: number[];
  latlng: [number, number][];
}

interface MetricDescriptor {
  key?: string;
  metricsIndex?: number;
}

interface ActivityDetailRow {
  metrics?: Array<number | null>;
}

interface PolylinePoint {
  lat?: number | null;
  lng?: number | null;
  lon?: number | null;
  elevation?: number | null;
  time?: number | null;
  distance?: number | null;
  heartRate?: number | null;
  speed?: number | null;
}

interface GarminDetailsBody {
  metricDescriptors?: MetricDescriptor[];
  activityDetailMetrics?: ActivityDetailRow[];
  geoPolylineDTO?: {
    polyline?: PolylinePoint[];
  };
  detailsAvailable?: boolean;
}

function findNestedGarminDetails(obj: Record<string, unknown>): GarminDetailsBody | null {
  for (const value of Object.values(obj)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const nested = value as GarminDetailsBody;
    if (Array.isArray(nested.activityDetailMetrics) || Array.isArray(nested.metricDescriptors)) {
      return nested;
    }
  }
  return null;
}

function unwrapGarminDetails(raw: unknown): GarminDetailsBody | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.activityDetailMetrics) || Array.isArray(obj.metricDescriptors)) {
    return obj as GarminDetailsBody;
  }
  return findNestedGarminDetails(obj);
}

function metricIndexMap(descriptors: MetricDescriptor[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of descriptors) {
    if (isSet(d.key) && isSet(d.metricsIndex)) {
      map.set(d.key, d.metricsIndex);
    }
  }
  return map;
}

function numAt(metrics: Array<number | null>, idx: number | undefined): number | null {
  if (idx === undefined || idx === null || idx < 0 || idx >= metrics.length) {
    return null;
  }
  const v = metrics[idx];
  return isSet(v) && Number.isFinite(v) ? v : null;
}

function pushPolylineTime(
  p: PolylinePoint,
  t0: number | null,
  series: { time: number[] },
): number | null {
  if (isSet(p.time)) {
    if (t0 === undefined || t0 === null) {
      t0 = p.time;
    }
    const sec = p.time > 1_000_000_000_000 ? (p.time - t0) / 1000 : p.time - t0;
    series.time.push(Math.max(0, sec));
  } else {
    series.time.push(series.time.length > 0 ? series.time[series.time.length - 1] + 1 : 0);
  }
  return t0;
}

function pushPolylineScalars(
  p: PolylinePoint,
  series: {
    distance: number[];
    altitude: number[];
    heartrate: number[];
    velocity: number[];
  },
): void {
  series.distance.push(p.distance ?? (series.distance.length ? series.distance.at(-1)! : 0));
  series.altitude.push(p.elevation ?? 0);
  series.heartrate.push(p.heartRate ?? 0);
  series.velocity.push(p.speed ?? 0);
}

function appendPolylinePoint(
  p: PolylinePoint,
  t0: number | null,
  series: {
    time: number[];
    distance: number[];
    altitude: number[];
    heartrate: number[];
    velocity: number[];
    latlng: [number, number][];
  },
): number | null {
  const { lat } = p;
  const lon = p.lng ?? p.lon;
  if (lat === undefined || lat === null || lon === undefined || lon === null) {
    return t0;
  }

  series.latlng.push([lat, lon]);
  t0 = pushPolylineTime(p, t0, series);
  pushPolylineScalars(p, series);
  return t0;
}

function buildFromPolyline(polyline: PolylinePoint[]): RawStreams {
  const series = {
    time: [] as number[],
    distance: [] as number[],
    altitude: [] as number[],
    heartrate: [] as number[],
    velocity: [] as number[],
    latlng: [] as [number, number][],
  };

  let t0: number | null = null;
  for (const p of polyline) {
    t0 = appendPolylinePoint(p, t0, series);
  }

  return {
    time: series.time,
    distance: series.distance,
    altitude: series.altitude,
    heartrate: series.heartrate,
    watts: [],
    cadence: [],
    velocity: series.velocity,
    latlng: series.latlng,
  };
}

/**
 * Convertit la réponse `/activity/{id}/details` Garmin en séries brutes
 * compatibles avec activity-analysis (même format que Strava).
 */
type MetricIndices = {
  tsIdx: number | undefined;
  distIdx: number | undefined;
  hrIdx: number | undefined;
  wattsIdx: number | undefined;
  speedIdx: number | undefined;
  altIdx: number | undefined;
  bikeCadIdx: number | undefined;
  runCadIdx: number | undefined;
  latIdx: number | undefined;
  lonIdx: number | undefined;
};

function metricIndices(idx: Map<string, number>): MetricIndices {
  return {
    tsIdx: idx.get('directTimestamp'),
    distIdx: idx.get('sumDistance'),
    hrIdx: idx.get('directHeartRate'),
    wattsIdx: idx.get('directPower'),
    speedIdx: idx.get('directSpeed'),
    altIdx: idx.get('directElevation'),
    bikeCadIdx: idx.get('directBikeCadence'),
    runCadIdx:
      idx.get('directRunCadence') ?? idx.get('directDoubleCadence') ?? idx.get('directCadence'),
    latIdx: idx.get('directLatitude'),
    lonIdx: idx.get('directLongitude'),
  };
}

function pushMetricTime(ts: number | null, series: { time: number[]; t0: number | null }): void {
  if (isSet(ts)) {
    if (series.t0 === undefined || series.t0 === null) {
      series.t0 = ts;
    }
    const sec = ts > 1_000_000_000_000 ? (ts - series.t0) / 1000 : ts - (series.t0 ?? 0);
    series.time.push(Math.max(0, Math.round(sec)));
    return;
  }
  series.time.push(series.time.length > 0 ? series.time[series.time.length - 1] + 1 : 0);
}

const METRIC_SERIES_PUSHERS: Array<{
  push: (
    m: Array<number | null>,
    indices: MetricIndices,
    series: {
      distance: number[];
      altitude: number[];
      heartrate: number[];
      watts: number[];
      cadence: number[];
      velocity: number[];
    },
  ) => void;
}> = [
  {
    push: (m, indices, series) => {
      series.distance.push(
        numAt(m, indices.distIdx) ?? (series.distance.length ? series.distance.at(-1)! : 0),
      );
    },
  },
  { push: (m, indices, series) => series.altitude.push(numAt(m, indices.altIdx) ?? 0) },
  { push: (m, indices, series) => series.heartrate.push(numAt(m, indices.hrIdx) ?? 0) },
  { push: (m, indices, series) => series.watts.push(numAt(m, indices.wattsIdx) ?? 0) },
  {
    push: (m, indices, series) =>
      series.cadence.push(numAt(m, indices.bikeCadIdx) ?? numAt(m, indices.runCadIdx) ?? 0),
  },
  { push: (m, indices, series) => series.velocity.push(numAt(m, indices.speedIdx) ?? 0) },
];

function pushMetricSeriesValues(
  m: Array<number | null>,
  indices: MetricIndices,
  series: {
    distance: number[];
    altitude: number[];
    heartrate: number[];
    watts: number[];
    cadence: number[];
    velocity: number[];
  },
): void {
  for (const { push } of METRIC_SERIES_PUSHERS) {
    push(m, indices, series);
  }
}

function pushMetricLatLng(
  m: Array<number | null>,
  indices: MetricIndices,
  latlng: [number, number][],
): void {
  const lat = numAt(m, indices.latIdx);
  const lon = numAt(m, indices.lonIdx);
  if (isSet(lat) && isSet(lon)) {
    latlng.push([lat, lon]);
  }
}

function pushMetricScalars(
  m: Array<number | null>,
  indices: MetricIndices,
  series: {
    distance: number[];
    altitude: number[];
    heartrate: number[];
    watts: number[];
    cadence: number[];
    velocity: number[];
    latlng: [number, number][];
  },
): void {
  pushMetricSeriesValues(m, indices, series);
  pushMetricLatLng(m, indices, series.latlng);
}

function appendMetricRow(
  row: ActivityDetailRow,
  indices: MetricIndices,
  series: {
    time: number[];
    distance: number[];
    altitude: number[];
    heartrate: number[];
    watts: number[];
    cadence: number[];
    velocity: number[];
    latlng: [number, number][];
    t0: number | null;
  },
): void {
  const m = row.metrics ?? [];
  pushMetricTime(numAt(m, indices.tsIdx), series);
  pushMetricScalars(m, indices, series);
}

function appendPolylineLatLng(details: GarminDetailsBody, latlng: [number, number][]): void {
  if (latlng.length > 0) {
    return;
  }
  for (const p of details.geoPolylineDTO?.polyline ?? []) {
    const { lat } = p;
    const lon = p.lng ?? p.lon;
    if (isSet(lat) && isSet(lon)) {
      latlng.push([lat, lon]);
    }
  }
}

export function parseGarminDetailsToRawStreams(details: GarminDetailsBody): RawStreams | null {
  const rows = details.activityDetailMetrics ?? [];
  const indices = metricIndices(metricIndexMap(details.metricDescriptors ?? []));

  if (rows.length === 0) {
    const poly = details.geoPolylineDTO?.polyline ?? [];
    return poly.length > 1 ? buildFromPolyline(poly) : null;
  }

  const series = {
    time: [] as number[],
    distance: [] as number[],
    altitude: [] as number[],
    heartrate: [] as number[],
    watts: [] as number[],
    cadence: [] as number[],
    velocity: [] as number[],
    latlng: [] as [number, number][],
    t0: null as number | null,
  };

  for (const row of rows) {
    appendMetricRow(row, indices, series);
  }

  appendPolylineLatLng(details, series.latlng);
  return {
    time: series.time,
    distance: series.distance,
    altitude: series.altitude,
    heartrate: series.heartrate,
    watts: series.watts,
    cadence: series.cadence,
    velocity: series.velocity,
    latlng: series.latlng,
  };
}

export function rawStreamsHaveSignal(raw: RawStreams): boolean {
  const has = (arr: number[]) => arr.length > 0 && arr.some((v) => isSet(v) && v !== 0);
  return (
    raw.latlng.length > 0 ||
    has(raw.heartrate) ||
    has(raw.watts) ||
    has(raw.altitude) ||
    has(raw.velocity) ||
    has(raw.distance)
  );
}

/** Récupère les séries temporelles + trace GPS depuis Garmin Connect. */
export async function fetchGarminActivityStreams(
  client: GCClient,
  garminActivityId: string | number,
): Promise<RawStreams | null> {
  const id = String(garminActivityId);
  try {
    const raw = await client.get(`${GARMIN_ACTIVITY_BASE}/${id}/details`, {
      maxChartSize: '2000',
      maxPolylineSize: '4000',
    });
    const details = unwrapGarminDetails(raw);
    if (!details) {
      return null;
    }
    if (details.detailsAvailable === false) {
      return null;
    }
    return parseGarminDetailsToRawStreams(details);
  } catch {
    return null;
  }
}

/** Météo Garmin pour une activité (optionnel, enrichit Activity.weather). */
export async function fetchGarminActivityWeather(
  client: GCClient,
  garminActivityId: string | number,
): Promise<string | null> {
  try {
    const raw = (await client.get(
      `${GARMIN_ACTIVITY_BASE}/${String(garminActivityId)}/weather`,
    )) as {
      weatherTypeDTO?: { desc?: string };
      temp?: number;
      windSpeed?: number;
    };
    const parts: string[] = [];
    if (raw.weatherTypeDTO?.desc) {
      parts.push(raw.weatherTypeDTO.desc);
    }
    if (isSet(raw.temp)) {
      parts.push(`${Math.round(raw.temp)}°C`);
    }
    if (isSet(raw.windSpeed)) {
      parts.push(`vent ${Math.round(raw.windSpeed)} km/h`);
    }
    return parts.length ? parts.join(' · ') : null;
  } catch {
    return null;
  }
}
