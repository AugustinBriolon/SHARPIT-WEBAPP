import { ActivityType, Prisma } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { prisma } from '@sharpit/db/client';

/**
 * Records & courbes de performance — désormais PERSISTÉS en base.
 *
 * Le calcul (PRs depuis les métriques + courbe de puissance/meilleurs temps
 * depuis les streams en cache) est lourd : on le fait une fois puis on stocke le
 * résultat (top 5 par catégorie) dans `PerformanceRecord`. La page lit le
 * stockage (instantané) ; le recalcul est déclenché à chaque mutation d'activité
 * et après les synchros Strava/backfill.
 */

/** Durées de référence pour la courbe de puissance (secondes). */
const POWER_DURATIONS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

/** Distances de référence pour les meilleurs temps de course (mètres). */
const RUN_DISTANCES = [400, 1000, 1609, 5000, 10000, 21097, 42195];

/** Combien d'entrées on garde par record (top 5). */
const TOP_N = 5;

interface RawStreams {
  time: number[];
  distance: number[];
  altitude: number[];
  heartrate: number[];
  watts: number[];
  cadence: number[];
  velocity: number[];
  latlng: [number, number][];
}

export type {
  BikeEffort,
  PowerCurvePoint,
  RecordCategory,
  RecordChange,
  RecordEntry,
  RecordsPayload,
  RunBestCategory,
  RunEffort,
} from '@sharpit/app/lib/training/records/record-types';
import type {
  BikeEffort,
  PowerCurvePoint,
  RecordCategory,
  RecordChange,
  RecordEntry,
  RecordsPayload,
  RunBestCategory,
  RunEffort,
} from '@sharpit/app/lib/training/records/record-types';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

function durationLabel(sec: number): string {
  if (sec < 60) {
    return `${sec} s`;
  }
  const min = sec / 60;
  return Number.isInteger(min) ? `${min} min` : `${(sec / 60).toFixed(1)} min`;
}

function distanceLabel(m: number): string {
  switch (m) {
    case 1609:
      return '1 mile';
    case 21097:
      return 'Semi';
    case 42195:
      return 'Marathon';
    default:
      return m < 1000 ? `${m} m` : `${m / 1000} km`;
  }
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtPace100(secPer100m: number): string {
  const m = Math.floor(secPer100m / 60);
  const s = Math.round(secPer100m % 60);
  return `${m}:${String(s).padStart(2, '0')}/100m`;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) {
    return `${h}h${String(m).padStart(2, '0')}`;
  }
  const s = Math.round(sec % 60);
  if (m > 0) {
    return `${m}min${s > 0 ? ` ${String(s).padStart(2, '0')}s` : ''}`;
  }
  return `${s}s`;
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

// ---------------------------------------------------------------------------
// Calcul depuis les streams
// ---------------------------------------------------------------------------

function hasSignal(arr: number[]): boolean {
  return arr.length > 0 && arr.some((v) => isSet(v) && v !== 0);
}

/** Ré-échantillonne une série (time, values) à 1 Hz par maintien de la valeur. */
function resample1Hz(time: number[], values: number[]): number[] {
  if (!time.length) {
    return [];
  }
  const maxT = Math.floor(time[time.length - 1]);
  if (maxT <= 0 || maxT > 200_000) {
    return [];
  }
  const grid = new Array<number>(maxT + 1).fill(0);
  let idx = 0;
  for (let s = 0; s <= maxT; s++) {
    while (idx < time.length - 1 && time[idx + 1] <= s) {
      idx++;
    }
    grid[s] = values[idx] ?? 0;
  }
  return grid;
}

/** Meilleure moyenne glissante sur une fenêtre de `window` secondes. */
function bestAverage(grid: number[], window: number): number | null {
  if (grid.length < window || window <= 0) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < window; i++) {
    sum += grid[i];
  }
  let best = sum;
  for (let i = window; i < grid.length; i++) {
    sum += grid[i] - grid[i - window];
    if (sum > best) {
      best = sum;
    }
  }
  return best / window;
}

/** Temps le plus court (s) pour couvrir `meters` sur une grille distance 1 Hz. */
function fastestTime(distGrid: number[], meters: number): number | null {
  let j = 0;
  let best = Infinity;
  for (let i = 0; i < distGrid.length; i++) {
    if (j < i) {
      j = i;
    }
    while (j < distGrid.length && distGrid[j] - distGrid[i] < meters) {
      j++;
    }
    if (j >= distGrid.length) {
      break;
    }
    const t = j - i;
    if (t < best) {
      best = t;
    }
  }
  return best === Infinity ? null : best;
}

// ---------------------------------------------------------------------------
// PRs (depuis les métriques)
// ---------------------------------------------------------------------------

interface MetricActivity {
  id: string;
  type: ActivityType;
  date: Date;
  title: string | null;
  duration: number | null;
  runMetrics: {
    distanceM: number | null;
    paceSecPerKm: number | null;
    elevationM?: number | null;
  } | null;
  bikeMetrics: {
    normalizedPower: number | null;
    avgPower: number | null;
    elevationM?: number | null;
  } | null;
  swimMetrics?: {
    distanceM: number | null;
    avgPaceSecPer100m: number | null;
  } | null;
}

interface Candidate {
  value: number;
  activity: MetricActivity;
}

type TopNEntriesInput = {
  activities: MetricActivity[];
  accessor: (a: MetricActivity) => number | null;
  mode: 'max' | 'min';
  format: (v: number) => string;
  sublabel?: (v: number, a: MetricActivity) => string | null;
};

/** Top N entrées pour un accesseur donné, triées (meilleur en premier). */
function topNEntries(input: TopNEntriesInput): RecordEntry[] {
  const { activities, accessor, mode, format, sublabel } = input;
  const cands = activities
    .map((a) => ({ value: accessor(a), activity: a }))
    .filter((c): c is Candidate => isSet(c.value) && !Number.isNaN(c.value) && c.value > 0);
  cands.sort((a, b) => (mode === 'max' ? b.value - a.value : a.value - b.value));
  return cands.slice(0, TOP_N).map((c, i) => ({
    rank: i + 1,
    value: c.value,
    displayValue: format(c.value),
    sublabel: sublabel?.(c.value, c.activity) ?? null,
    activityId: c.activity.id,
    date: c.activity.date.toISOString(),
    title: c.activity.title,
  }));
}

interface PrDef {
  group: 'run' | 'bike' | 'swim';
  key: string;
  label: string;
}

/** Définition (ordre + libellés) de toutes les catégories de PR. */
const PR_DEFS: PrDef[] = [
  { group: 'run', key: 'run-distance', label: 'Plus longue sortie' },
  { group: 'run', key: 'run-elevation', label: 'Plus gros dénivelé' },
  { group: 'run', key: 'run-pace', label: 'Meilleure allure moyenne' },
  { group: 'run', key: 'run-duration', label: 'Plus longue durée de course' },
  { group: 'bike', key: 'bike-np', label: 'Meilleure puissance normalisée' },
  { group: 'bike', key: 'bike-avg-power', label: 'Meilleure puissance moyenne' },
  { group: 'bike', key: 'bike-elevation', label: 'Plus gros dénivelé' },
  { group: 'bike', key: 'bike-duration', label: 'Plus longue durée à vélo' },
  { group: 'swim', key: 'swim-distance', label: 'Plus longue nage' },
  { group: 'swim', key: 'swim-pace', label: 'Meilleure allure /100m' },
  { group: 'swim', key: 'swim-duration', label: 'Plus longue durée de nage' },
];

/** Personal-record family for a category key, or null when the key is not one. */
export function findPersonalRecordDefinition(key: string): Readonly<PrDef> | null {
  return PR_DEFS.find((def) => def.key === key) ?? null;
}

const DURATION_PR_TYPE: Partial<Record<string, ActivityType>> = {
  'run-duration': ActivityType.RUN,
  'bike-duration': ActivityType.BIKE,
  'swim-duration': ActivityType.SWIM,
};

const DURATION_PR_CATEGORIES = Object.keys(DURATION_PR_TYPE);

/**
 * Detects the pre-fix duration PR bug: same longest session ranked #1 across
 * sports, or a leader whose activity type does not match its category.
 * Pure helper — used by getStoredRecords to trigger a one-shot repair in prod.
 */
function hasLegacyDurationLabel(leaders: ReadonlyArray<{ label: string }>): boolean {
  return leaders.some((row) => row.label === 'Plus longue durée');
}

function hasDuplicateDurationLeaders(
  leaders: ReadonlyArray<{ activityId: string | null }>,
): boolean {
  const ids = leaders.map((row) => row.activityId).filter((id): id is string => Boolean(id));
  return ids.length > 1 && new Set(ids).size < ids.length;
}

function hasMismatchedDurationLeaderType(
  leaders: ReadonlyArray<{
    category: string;
    activityId: string | null;
    activityType?: ActivityType | null;
  }>,
): boolean {
  for (const row of leaders) {
    if (!row.activityId || row.activityType === undefined || row.activityType === null) {
      continue;
    }
    const expected = DURATION_PR_TYPE[row.category];
    if (expected && row.activityType !== expected) {
      return true;
    }
  }
  return false;
}

export function durationPrLeadersNeedRepair(
  leaders: ReadonlyArray<{
    category: string;
    activityId: string | null;
    label: string;
    activityType?: ActivityType | null;
  }>,
): boolean {
  if (leaders.length === 0) {
    return false;
  }
  return (
    hasLegacyDurationLabel(leaders) ||
    hasDuplicateDurationLeaders(leaders) ||
    hasMismatchedDurationLeaderType(leaders)
  );
}

function activitiesForDurationPr(defKey: string, activities: MetricActivity[]): MetricActivity[] {
  const type = DURATION_PR_TYPE[defKey];
  if (!type) {
    return activities;
  }
  return activities.filter((a) => a.type === type);
}

const PR_ENTRY_BUILDERS: Record<string, (activities: MetricActivity[]) => RecordEntry[]> = {
  'run-distance': (activities) =>
    topNEntries({
      activities,
      accessor: (a) => a.runMetrics?.distanceM ?? null,
      mode: 'max',
      format: fmtDistance,
    }),
  'run-elevation': (activities) =>
    topNEntries({
      activities,
      accessor: (a) => a.runMetrics?.elevationM ?? null,
      mode: 'max',
      format: (v) => `${Math.round(v)} m D+`,
    }),
  'run-pace': (activities) =>
    topNEntries({
      activities: activities.filter((a) => (a.runMetrics?.distanceM ?? 0) >= 3000),
      accessor: (a) => a.runMetrics?.paceSecPerKm ?? null,
      mode: 'min',
      format: fmtPace,
      sublabel: (_v, a) =>
        a.runMetrics?.distanceM ? `sur ${fmtDistance(a.runMetrics.distanceM)}` : null,
    }),
  'run-duration': (activities) =>
    topNEntries({
      activities: activitiesForDurationPr('run-duration', activities),
      accessor: (a) => a.duration ?? null,
      mode: 'max',
      format: fmtDuration,
    }),
  'bike-duration': (activities) =>
    topNEntries({
      activities: activitiesForDurationPr('bike-duration', activities),
      accessor: (a) => a.duration ?? null,
      mode: 'max',
      format: fmtDuration,
    }),
  'swim-duration': (activities) =>
    topNEntries({
      activities: activitiesForDurationPr('swim-duration', activities),
      accessor: (a) => a.duration ?? null,
      mode: 'max',
      format: fmtDuration,
    }),
  'bike-np': (activities) =>
    topNEntries({
      activities,
      accessor: (a) => a.bikeMetrics?.normalizedPower ?? null,
      mode: 'max',
      format: (v) => `${Math.round(v)} W`,
    }),
  'bike-avg-power': (activities) =>
    topNEntries({
      activities,
      accessor: (a) => a.bikeMetrics?.avgPower ?? null,
      mode: 'max',
      format: (v) => `${Math.round(v)} W`,
    }),
  'bike-elevation': (activities) =>
    topNEntries({
      activities,
      accessor: (a) => a.bikeMetrics?.elevationM ?? null,
      mode: 'max',
      format: (v) => `${Math.round(v)} m D+`,
    }),
  'swim-distance': (activities) =>
    topNEntries({
      activities,
      accessor: (a) => a.swimMetrics?.distanceM ?? null,
      mode: 'max',
      format: fmtDistance,
    }),
  'swim-pace': (activities) =>
    topNEntries({
      activities,
      accessor: (a) => a.swimMetrics?.avgPaceSecPer100m ?? null,
      mode: 'min',
      format: fmtPace100,
    }),
};

function buildPrCategory(def: PrDef, activities: MetricActivity[]): RecordCategory {
  const builder = PR_ENTRY_BUILDERS[def.key];
  const entries = builder ? builder(activities) : [];
  return { key: def.key, label: def.label, entries };
}

/** Builds PR categories from in-memory metrics (no DB). Used by compute + unit tests. */
export function buildMetricPrCategories(metrics: MetricActivity[]): {
  run: RecordCategory[];
  bike: RecordCategory[];
  swim: RecordCategory[];
} {
  return {
    run: PR_DEFS.filter((d) => d.group === 'run').map((d) => buildPrCategory(d, metrics)),
    bike: PR_DEFS.filter((d) => d.group === 'bike').map((d) => buildPrCategory(d, metrics)),
    swim: PR_DEFS.filter((d) => d.group === 'swim').map((d) => buildPrCategory(d, metrics)),
  };
}

// ---------------------------------------------------------------------------
// Calcul complet
// ---------------------------------------------------------------------------

interface StreamCandidate {
  value: number;
  id: string;
  date: Date;
  title: string | null;
}

interface StreamActivity {
  id: string;
  type: ActivityType;
  date: Date;
  title: string | null;
  stream: { data: unknown } | null;
}

/** Sélection Prisma des activités avec stream exploitable, pour un ou plusieurs types. */
function streamSelect() {
  return {
    id: true,
    type: true,
    date: true,
    title: true,
    stream: { select: { data: true } },
  } as const;
}

/** Courbe de puissance (meilleur effort par durée) à partir des streams vélo. */
function canCollectPowerStream(
  activity: StreamActivity,
  raw: RawStreams | null,
): raw is RawStreams {
  return Boolean(
    raw?.time?.length && activity.type === ActivityType.BIKE && hasSignal(raw.watts ?? []),
  );
}

function pushPowerCandidatesFromGrid(
  activity: StreamActivity,
  grid: number[],
  powerCand: Map<number, StreamCandidate[]>,
): void {
  for (const dur of POWER_DURATIONS) {
    const avg = bestAverage(grid, dur);
    if (avg === undefined || avg === null || avg <= 0) {
      continue;
    }
    const list = powerCand.get(dur) ?? [];
    list.push({
      value: Math.round(avg),
      id: activity.id,
      date: activity.date,
      title: activity.title,
    });
    powerCand.set(dur, list);
  }
}

function collectPowerCandidates(
  activity: StreamActivity,
  powerCand: Map<number, StreamCandidate[]>,
): void {
  const raw = activity.stream?.data as unknown as RawStreams | null;
  if (!canCollectPowerStream(activity, raw)) {
    return;
  }
  pushPowerCandidatesFromGrid(activity, resample1Hz(raw.time, raw.watts), powerCand);
}

function powerCurvePointFromDuration(
  seconds: number,
  powerCand: Map<number, StreamCandidate[]>,
): PowerCurvePoint | null {
  const [best] = (powerCand.get(seconds) ?? []).sort((a, b) => b.value - a.value);
  if (!best) {
    return null;
  }
  return {
    seconds,
    label: durationLabel(seconds),
    watts: best.value,
    activityId: best.id,
    date: best.date.toISOString(),
    title: best.title,
  };
}

function computePowerCurveFrom(streamActivities: StreamActivity[]): PowerCurvePoint[] {
  const powerCand = new Map<number, StreamCandidate[]>();
  for (const activity of streamActivities) {
    collectPowerCandidates(activity, powerCand);
  }
  return POWER_DURATIONS.map((d) => powerCurvePointFromDuration(d, powerCand)).filter(
    (p): p is PowerCurvePoint => isSet(p),
  );
}

/** Meilleurs temps de course (top 5 par distance) à partir des streams course. */
function canCollectRunStream(activity: StreamActivity, raw: RawStreams | null): raw is RawStreams {
  return Boolean(
    raw?.time?.length && activity.type === ActivityType.RUN && hasSignal(raw.distance ?? []),
  );
}

function pushRunCandidatesFromGrid(
  activity: StreamActivity,
  distGrid: number[],
  runCand: Map<number, StreamCandidate[]>,
): void {
  const total = distGrid.length ? distGrid[distGrid.length - 1] : 0;
  for (const meters of RUN_DISTANCES) {
    if (total < meters) {
      continue;
    }
    const secs = fastestTime(distGrid, meters);
    if (secs === undefined || secs === null || secs <= 0) {
      continue;
    }
    const list = runCand.get(meters) ?? [];
    list.push({ value: secs, id: activity.id, date: activity.date, title: activity.title });
    runCand.set(meters, list);
  }
}

function collectRunCandidates(
  activity: StreamActivity,
  runCand: Map<number, StreamCandidate[]>,
): void {
  const raw = activity.stream?.data as unknown as RawStreams | null;
  if (!canCollectRunStream(activity, raw)) {
    return;
  }
  pushRunCandidatesFromGrid(activity, resample1Hz(raw.time, raw.distance), runCand);
}

function runBestCategoryFromDistance(
  meters: number,
  runCand: Map<number, StreamCandidate[]>,
): RunBestCategory | null {
  const arr = (runCand.get(meters) ?? []).sort((a, b) => a.value - b.value).slice(0, TOP_N);
  if (!arr.length) {
    return null;
  }
  return {
    meters,
    label: distanceLabel(meters),
    entries: arr.map((c, i) => ({
      rank: i + 1,
      value: c.value,
      displayValue: fmtTime(c.value),
      sublabel: fmtPace(Math.round((c.value / meters) * 1000)),
      activityId: c.id,
      date: c.date.toISOString(),
      title: c.title,
    })),
  };
}

function computeRunBestsFrom(streamActivities: StreamActivity[]): RunBestCategory[] {
  const runCand = new Map<number, StreamCandidate[]>();
  for (const activity of streamActivities) {
    collectRunCandidates(activity, runCand);
  }
  return RUN_DISTANCES.map((meters) => runBestCategoryFromDistance(meters, runCand)).filter(
    (r): r is RunBestCategory => isSet(r),
  );
}

/**
 * Construit les efforts course/vélo depuis les métriques d'activité.
 * Indépendant des streams : couvre tout l'historique. On privilégie la durée
 * réelle (temps de séance) et on retombe sur l'allure Garmin si besoin.
 */
function resolveRunEffortSeconds(a: MetricActivity, meters: number): number | null {
  if (a.duration && a.duration > 0) {
    return a.duration;
  }
  if (a.runMetrics?.paceSecPerKm) {
    return (a.runMetrics.paceSecPerKm * meters) / 1000;
  }
  return null;
}

function pushRunEffortFromMetric(a: MetricActivity, runEfforts: RunEffort[]): void {
  const meters = a.runMetrics?.distanceM ?? null;
  if (!meters || meters < 1500) {
    return;
  }
  const seconds = resolveRunEffortSeconds(a, meters);
  if (!seconds || seconds <= 0) {
    return;
  }
  runEfforts.push({ meters, seconds, date: a.date.toISOString(), activityId: a.id });
}

function resolveBikePowerWatts(a: MetricActivity): number | null {
  const watts = a.bikeMetrics?.normalizedPower ?? a.bikeMetrics?.avgPower ?? null;
  return watts && watts > 0 ? watts : null;
}

function pushBikeEffortFromMetric(a: MetricActivity, bikeEfforts: BikeEffort[]): void {
  const watts = resolveBikePowerWatts(a);
  if (!watts || !a.duration || a.duration < 1200) {
    return;
  }
  bikeEfforts.push({
    seconds: a.duration,
    watts,
    date: a.date.toISOString(),
    activityId: a.id,
  });
}

function computeMetricEfforts(metrics: MetricActivity[]): {
  runEfforts: RunEffort[];
  bikeEfforts: BikeEffort[];
} {
  const runEfforts: RunEffort[] = [];
  const bikeEfforts: BikeEffort[] = [];

  for (const activity of metrics) {
    if (activity.type === ActivityType.RUN) {
      pushRunEffortFromMetric(activity, runEfforts);
    } else if (activity.type === ActivityType.BIKE) {
      pushBikeEffortFromMetric(activity, bikeEfforts);
    }
  }

  return { runEfforts, bikeEfforts };
}

const RANKED_RECORDS_METRIC_SELECT = {
  id: true,
  type: true,
  date: true,
  title: true,
  duration: true,
  runMetrics: {
    select: { distanceM: true, elevationM: true, paceSecPerKm: true },
  },
  bikeMetrics: {
    select: { normalizedPower: true, avgPower: true, elevationM: true },
  },
  swimMetrics: {
    select: { distanceM: true, avgPaceSecPer100m: true },
  },
} as const;

/** Calcule l'intégralité des records (top 5) — sans écrire en base. */
// Records deliberately include absorbed multisport legs (mergedIntoId set): a hidden Strava
// swim/bike/run leg is the only per-sport row of that race, never a duplicate of a visible one.
export async function computeRankedRecords(athleteId: string): Promise<RecordsPayload> {
  const [metricActivities, streamActivities, totalActivities, streamsAnalyzed] = await Promise.all([
    prisma.activity.findMany({
      where: { athleteId },
      select: RANKED_RECORDS_METRIC_SELECT,
    }),
    prisma.activity.findMany({
      where: {
        athleteId,
        type: { in: [ActivityType.RUN, ActivityType.BIKE] },
        stream: { available: true },
      },
      select: {
        id: true,
        type: true,
        date: true,
        title: true,
        stream: { select: { data: true } },
      },
    }),
    prisma.activity.count({ where: { athleteId, ...visibleActivityWhere } }),
    prisma.activityStream.count({ where: { available: true, activity: { athleteId } } }),
  ]);

  const metrics = metricActivities as MetricActivity[];
  const streams = streamActivities as StreamActivity[];
  const { runEfforts, bikeEfforts } = computeMetricEfforts(metrics);

  return {
    prs: buildMetricPrCategories(metrics),
    powerCurve: computePowerCurveFrom(streams),
    runBests: computeRunBestsFrom(streams),
    runEfforts,
    bikeEfforts,
    streamsAnalyzed,
    totalActivities,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

/** Groupes de records persistés (= colonne `group` en base). */
export type RecordGroup =
  'run' | 'bike' | 'swim' | 'power' | 'run-best' | 'run-effort' | 'bike-effort';

const METRIC_GROUPS: ReadonlyArray<RecordGroup> = ['run', 'bike', 'swim'];
const EFFORT_GROUPS: ReadonlyArray<RecordGroup> = ['run-effort', 'bike-effort'];

/**
 * Les efforts de référence (nuage de points des prédictions) partagent la table
 * `PerformanceRecord` mais n'en sont PAS : chaque séance course/vélo produit une
 * ligne. Ils ne doivent jamais alimenter un badge « Record » ni un diff de sync.
 */
export function isEffortRecordGroup(group: string): boolean {
  return (EFFORT_GROUPS as ReadonlyArray<string>).includes(group);
}

/** Retire les lignes d'effort d'un lot de lignes de records. */
export function excludeEffortRows<T extends { group: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isEffortRecordGroup(row.group));
}

/** Groupes de records impactés par une activité d'un type donné. */
function groupsForType(type: ActivityType): RecordGroup[] {
  switch (type) {
    case ActivityType.RUN:
      return ['run', 'run-best', 'run-effort'];
    case ActivityType.BIKE:
      return ['bike', 'power', 'bike-effort'];
    case ActivityType.SWIM:
      return ['swim'];
    default:
      return []; // STRENGTH : aucun record
  }
}

type RecordRow = Prisma.PerformanceRecordCreateManyInput;

function categoryToRows(athleteId: string, group: RecordGroup, cat: RecordCategory): RecordRow[] {
  return cat.entries.map((e) => ({
    athleteId,
    group,
    category: cat.key,
    label: cat.label,
    rank: e.rank,
    value: e.value,
    displayValue: e.displayValue,
    sublabel: e.sublabel,
    activityId: e.activityId,
    activityDate: new Date(e.date),
    activityTitle: e.title,
  }));
}

function powerCurveToRows(athleteId: string, points: PowerCurvePoint[]): RecordRow[] {
  return points.map((p) => ({
    athleteId,
    group: 'power',
    category: `power-${p.seconds}`,
    label: p.label,
    rank: 1,
    value: p.watts,
    displayValue: `${p.watts} W`,
    sublabel: null,
    activityId: p.activityId,
    activityDate: new Date(p.date),
    activityTitle: p.title,
  }));
}

function runBestsToRows(athleteId: string, bests: RunBestCategory[]): RecordRow[] {
  return bests.flatMap((rb) =>
    rb.entries.map((e) => ({
      athleteId,
      group: 'run-best' as const,
      category: `run-best-${rb.meters}`,
      label: rb.label,
      rank: e.rank,
      value: e.value,
      displayValue: e.displayValue,
      sublabel: e.sublabel,
      activityId: e.activityId,
      activityDate: new Date(e.date),
      activityTitle: e.title,
    })),
  );
}

/** Persist scatter-reference efforts (no activity join on GET). */
function effortsToRows(
  athleteId: string,
  runEfforts: RunEffort[],
  bikeEfforts: BikeEffort[],
): RecordRow[] {
  return [
    ...runEfforts.map((e, index) => ({
      athleteId,
      group: 'run-effort' as const,
      category: `run-effort-${index}`,
      label: 'Run effort',
      // rank 0 : point de référence, pas un classement (les records sont rank >= 1).
      rank: 0,
      value: e.meters,
      displayValue: String(e.seconds),
      sublabel: null,
      activityId: e.activityId ?? null,
      activityDate: e.date ? new Date(e.date) : new Date(0),
      activityTitle: null,
    })),
    ...bikeEfforts.map((e, index) => ({
      athleteId,
      group: 'bike-effort' as const,
      category: `bike-effort-${index}`,
      label: 'Bike effort',
      rank: 0,
      value: e.watts,
      displayValue: String(e.seconds),
      sublabel: null,
      activityId: e.activityId ?? null,
      activityDate: e.date ? new Date(e.date) : new Date(0),
      activityTitle: null,
    })),
  ];
}

function effortRowDate(row: { activityDate?: Date | null }): string | undefined {
  return row.activityDate && row.activityDate.getTime() > 0
    ? row.activityDate.toISOString()
    : undefined;
}

function pushRunEffortFromRow(
  row: {
    value: number;
    displayValue: string;
    activityDate?: Date | null;
    activityId?: string | null;
  },
  runEfforts: RunEffort[],
): void {
  const seconds = Number(row.displayValue);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }
  runEfforts.push({
    meters: row.value,
    seconds,
    date: effortRowDate(row),
    activityId: row.activityId ?? null,
  });
}

function pushBikeEffortFromRow(
  row: {
    value: number;
    displayValue: string;
    activityDate?: Date | null;
    activityId?: string | null;
  },
  bikeEfforts: BikeEffort[],
): void {
  const seconds = Number(row.displayValue);
  if (!Number.isFinite(seconds) || seconds <= 0 || row.value <= 0) {
    return;
  }
  bikeEfforts.push({
    seconds,
    watts: row.value,
    date: effortRowDate(row),
    activityId: row.activityId ?? null,
  });
}

function effortsFromRows(
  rows: Array<{
    group: string;
    value: number;
    displayValue: string;
    activityDate?: Date | null;
    activityId?: string | null;
  }>,
): {
  runEfforts: RunEffort[];
  bikeEfforts: BikeEffort[];
} {
  const runEfforts: RunEffort[] = [];
  const bikeEfforts: BikeEffort[] = [];
  for (const row of rows) {
    if (row.group === 'run-effort') {
      pushRunEffortFromRow(row, runEfforts);
    } else if (row.group === 'bike-effort') {
      pushBikeEffortFromRow(row, bikeEfforts);
    }
  }
  return { runEfforts, bikeEfforts };
}

async function loadMetricActivities(athleteId: string): Promise<MetricActivity[]> {
  const rows = await prisma.activity.findMany({
    where: { athleteId },
    select: {
      id: true,
      type: true,
      date: true,
      title: true,
      duration: true,
      runMetrics: {
        select: { distanceM: true, elevationM: true, paceSecPerKm: true },
      },
      bikeMetrics: {
        select: { normalizedPower: true, avgPower: true, elevationM: true },
      },
      swimMetrics: {
        select: { distanceM: true, avgPaceSecPer100m: true },
      },
    },
  });
  return rows as MetricActivity[];
}

/** Lignes des catégories de PR (métriques) pour un groupe donné. */
function metricRowsForGroup(
  athleteId: string,
  group: 'run' | 'bike' | 'swim',
  metrics: MetricActivity[],
): RecordRow[] {
  return PR_DEFS.filter((d) => d.group === group).flatMap((def) =>
    categoryToRows(athleteId, group, buildPrCategory(def, metrics)),
  );
}

/** Construit les lignes pour les groupes demandés (chargement ciblé). */
async function appendEffortGroupRows(
  athleteId: string,
  groups: Set<RecordGroup>,
  metrics: MetricActivity[],
  rows: RecordRow[],
): Promise<void> {
  const { runEfforts, bikeEfforts } = computeMetricEfforts(metrics);
  if (groups.has('run-effort')) {
    rows.push(...effortsToRows(athleteId, runEfforts, []).filter((r) => r.group === 'run-effort'));
  }
  if (groups.has('bike-effort')) {
    rows.push(
      ...effortsToRows(athleteId, [], bikeEfforts).filter((r) => r.group === 'bike-effort'),
    );
  }
}

async function appendStreamGroupRows(
  athleteId: string,
  groups: Set<RecordGroup>,
  rows: RecordRow[],
): Promise<void> {
  if (groups.has('power')) {
    const bikeStreams = (await prisma.activity.findMany({
      where: { athleteId, type: ActivityType.BIKE, stream: { available: true } },
      select: streamSelect(),
    })) as StreamActivity[];
    rows.push(...powerCurveToRows(athleteId, computePowerCurveFrom(bikeStreams)));
  }

  if (groups.has('run-best')) {
    const runStreams = (await prisma.activity.findMany({
      where: { athleteId, type: ActivityType.RUN, stream: { available: true } },
      select: streamSelect(),
    })) as StreamActivity[];
    rows.push(...runBestsToRows(athleteId, computeRunBestsFrom(runStreams)));
  }
}

async function buildRowsForGroups(
  athleteId: string,
  groups: Set<RecordGroup>,
): Promise<RecordRow[]> {
  const rows: RecordRow[] = [];
  const metricGroups = [...groups].filter((g): g is 'run' | 'bike' | 'swim' =>
    METRIC_GROUPS.includes(g),
  );
  const needsEfforts = EFFORT_GROUPS.some((g) => groups.has(g));
  const metrics =
    metricGroups.length > 0 || needsEfforts ? await loadMetricActivities(athleteId) : null;

  if (metrics && metricGroups.length) {
    for (const g of metricGroups) {
      rows.push(...metricRowsForGroup(athleteId, g, metrics));
    }
  }

  if (metrics && needsEfforts) {
    await appendEffortGroupRows(athleteId, groups, metrics, rows);
  }

  await appendStreamGroupRows(athleteId, groups, rows);
  return rows;
}

/** Compare les anciens et nouveaux leaders (#1) par catégorie. */
function buildAfterLeadersMap(afterRows: RecordRow[]): Map<string, RecordRow> {
  const afterLeaders = new Map<string, RecordRow>();
  for (const row of excludeEffortRows(afterRows)) {
    if (row.rank === 1) {
      afterLeaders.set(row.category, row);
    }
  }
  return afterLeaders;
}

function leaderChanged(
  prev: { activityId: string | null; value: number; displayValue: string } | undefined,
  row: RecordRow,
): boolean {
  return !prev || prev.activityId !== row.activityId || prev.value !== row.value;
}

function diffRecordChanges(
  beforeLeaders: Map<string, { activityId: string | null; value: number; displayValue: string }>,
  afterRows: RecordRow[],
): RecordChange[] {
  const afterLeaders = buildAfterLeadersMap(afterRows);
  const changes: RecordChange[] = [];
  for (const [category, row] of afterLeaders) {
    const prev = beforeLeaders.get(category);
    if (!leaderChanged(prev, row)) {
      continue;
    }
    changes.push({
      category,
      label: row.label,
      displayValue: row.displayValue,
      activityId: row.activityId ?? null,
      activityTitle: row.activityTitle ?? null,
      previousDisplayValue: prev?.displayValue ?? null,
    });
  }
  return changes;
}

/** Ne garde que les records battus par les activités du lot (sync / backfill). */
export function filterRecordChangesByActivities(
  changes: RecordChange[],
  activityIds: Iterable<string>,
): RecordChange[] {
  const ids = new Set(activityIds);
  return changes.filter((c) => isSet(c.activityId) && ids.has(c.activityId));
}

/** Records personnels (#1) détenus par une séance. */
export async function getPerformanceRecordsForActivity(athleteId: string, activityId: string) {
  return prisma.performanceRecord.findMany({
    // `notIn` couvre les lignes d'effort déjà stockées en rank 1 (avant fix).
    where: { athleteId, activityId, rank: 1, group: { notIn: [...EFFORT_GROUPS] } },
    orderBy: { label: 'asc' },
    select: {
      category: true,
      label: true,
    },
  });
}

/** Stored podium (best first) of one record category for one athlete. */
export async function getPerformanceRecordPodium(athleteId: string, category: string, take = 3) {
  return prisma.performanceRecord.findMany({
    where: { athleteId, category },
    orderBy: { rank: 'asc' },
    take,
    select: { rank: true, displayValue: true, activityDate: true, activityTitle: true },
  });
}

export {
  RECORDS_PAGE_PATH,
  recordCategoryAnchorId,
  recordCategoryHref,
  recordSportTabFromCategory,
  type RecordSportTab,
} from '@sharpit/app/lib/training/records/record-links';

/** Recalcule uniquement les `groups` ciblés et remplace ces lignes en base. */
export async function recomputeRecordGroups(
  athleteId: string,
  groups: Set<RecordGroup>,
): Promise<RecordChange[]> {
  if (groups.size === 0) {
    return [];
  }
  const affected = [...groups];

  const beforeRows = await prisma.performanceRecord.findMany({
    where: { athleteId, group: { in: affected }, rank: 1 },
  });
  const beforeLeaders = new Map(
    beforeRows.map((r) => [
      r.category,
      { activityId: r.activityId, value: r.value, displayValue: r.displayValue },
    ]),
  );

  const rows = await buildRowsForGroups(athleteId, groups);

  await prisma.$transaction([
    prisma.performanceRecord.deleteMany({ where: { athleteId, group: { in: affected } } }),
    ...(rows.length ? [prisma.performanceRecord.createMany({ data: rows })] : []),
  ]);

  return diffRecordChanges(beforeLeaders, rows);
}

/** Recalcule tous les records et remplace le contenu de la table. */
export async function recomputeAndStoreRecords(athleteId: string): Promise<RecordsPayload> {
  const payload = await computeRankedRecords(athleteId);
  const rows: RecordRow[] = [
    ...payload.prs.run.flatMap((c) => categoryToRows(athleteId, 'run', c)),
    ...payload.prs.bike.flatMap((c) => categoryToRows(athleteId, 'bike', c)),
    ...payload.prs.swim.flatMap((c) => categoryToRows(athleteId, 'swim', c)),
    ...powerCurveToRows(athleteId, payload.powerCurve),
    ...runBestsToRows(athleteId, payload.runBests),
    ...effortsToRows(athleteId, payload.runEfforts, payload.bikeEfforts),
  ];

  await prisma.$transaction([
    prisma.performanceRecord.deleteMany({ where: { athleteId } }),
    ...(rows.length ? [prisma.performanceRecord.createMany({ data: rows })] : []),
  ]);

  return payload;
}

/** Recalcule incrémentalement les records impactés par des activités de ces types. */
export async function updateRecordsForTypes(
  athleteId: string,
  types: Iterable<ActivityType>,
): Promise<RecordChange[]> {
  const groups = new Set<RecordGroup>();
  for (const t of types) {
    for (const g of groupsForType(t)) {
      groups.add(g);
    }
  }
  return recomputeRecordGroups(athleteId, groups);
}

/** Variante sans throw pour les types donnés (à appeler depuis les mutations). */
export async function updateRecordsForTypesSafe(
  athleteId: string,
  types: Iterable<ActivityType>,
): Promise<RecordChange[]> {
  try {
    return await updateRecordsForTypes(athleteId, types);
  } catch (error) {
    console.error('[records] update', error);
    return [];
  }
}

/** Recalcul complet sans jamais throw (premier remplissage). */
export async function recomputeRecordsSafe(athleteId: string): Promise<void> {
  try {
    await recomputeAndStoreRecords(athleteId);
  } catch (error) {
    console.error('[records] recompute', error);
  }
}

/**
 * Recalcule uniquement les groupes impactés après une sync cron/manuelle.
 * Évite de relire tous les streams JSON à chaque exécution (principal poste réseau).
 */
async function mergeGroupsForBackfill(
  athleteId: string,
  groups: Set<RecordGroup>,
  backfillIds: string[],
): Promise<void> {
  if (backfillIds.length === 0) {
    return;
  }
  const activities = await prisma.activity.findMany({
    where: { id: { in: backfillIds }, athleteId },
    select: { type: true },
  });
  for (const activity of activities) {
    for (const group of groupsForType(activity.type)) {
      groups.add(group);
    }
  }
}

export async function updateRecordsAfterProviderSync(
  athleteId: string,
  input: {
    importedTypes: Iterable<ActivityType>;
    backfilledActivityIds?: Iterable<string>;
  },
): Promise<void> {
  try {
    const recordCount = await prisma.performanceRecord.count({ where: { athleteId } });
    if (recordCount === 0) {
      await recomputeAndStoreRecords(athleteId);
      return;
    }

    const groups = new Set<RecordGroup>();
    for (const t of input.importedTypes) {
      for (const g of groupsForType(t)) {
        groups.add(g);
      }
    }

    await mergeGroupsForBackfill(athleteId, groups, [...(input.backfilledActivityIds ?? [])]);

    if (groups.size > 0) {
      await recomputeRecordGroups(athleteId, groups);
    }
  } catch (error) {
    console.error('[records] updateAfterSync', error);
  }
}

function emptyPayload(totalActivities = 0, streamsAnalyzed = 0): RecordsPayload {
  return {
    prs: {
      run: PR_DEFS.filter((d) => d.group === 'run').map((d) => ({
        key: d.key,
        label: d.label,
        entries: [],
      })),
      bike: PR_DEFS.filter((d) => d.group === 'bike').map((d) => ({
        key: d.key,
        label: d.label,
        entries: [],
      })),
      swim: PR_DEFS.filter((d) => d.group === 'swim').map((d) => ({
        key: d.key,
        label: d.label,
        entries: [],
      })),
    },
    powerCurve: [],
    runBests: [],
    runEfforts: [],
    bikeEfforts: [],
    streamsAnalyzed,
    totalActivities,
    generatedAt: null,
  };
}

/** Lit les records stockés et les remet en forme pour le client. */
async function repairDurationLeadersIfNeeded(
  athleteId: string,
  rows: Awaited<ReturnType<typeof prisma.performanceRecord.findMany>>,
) {
  const durationLeaders = rows.filter(
    (r) => DURATION_PR_CATEGORIES.includes(r.category) && r.rank === 1,
  );
  if (durationLeaders.length === 0) {
    return rows;
  }

  const activityIds = [
    ...new Set(durationLeaders.map((r) => r.activityId).filter((id): id is string => Boolean(id))),
  ];
  const activities =
    activityIds.length > 0
      ? await prisma.activity.findMany({
          where: { id: { in: activityIds }, athleteId },
          select: { id: true, type: true },
        })
      : [];
  const typeById = new Map(activities.map((a) => [a.id, a.type]));
  const needsRepair = durationPrLeadersNeedRepair(
    durationLeaders.map((r) => ({
      category: r.category,
      activityId: r.activityId,
      label: r.label,
      activityType: r.activityId ? (typeById.get(r.activityId) ?? null) : null,
    })),
  );
  if (!needsRepair) {
    return rows;
  }

  await recomputeRecordGroups(athleteId, new Set(METRIC_GROUPS));
  return prisma.performanceRecord.findMany({
    where: { athleteId },
    orderBy: [{ category: 'asc' }, { rank: 'asc' }],
  });
}

async function loadStoredEfforts(
  athleteId: string,
  rows: Awaited<ReturnType<typeof prisma.performanceRecord.findMany>>,
  totalActivities: number,
): Promise<{ runEfforts: RunEffort[]; bikeEfforts: BikeEffort[] }> {
  const hasEffortRows = rows.some((r) => r.group === 'run-effort' || r.group === 'bike-effort');
  if (hasEffortRows) {
    return effortsFromRows(rows);
  }
  if (totalActivities <= 0) {
    return { runEfforts: [], bikeEfforts: [] };
  }

  await recomputeRecordGroups(athleteId, new Set(['run-effort', 'bike-effort']));
  const effortRows = await prisma.performanceRecord.findMany({
    where: { athleteId, group: { in: ['run-effort', 'bike-effort'] } },
  });
  return effortsFromRows(effortRows);
}

type StoredRecordRows = Awaited<ReturnType<typeof prisma.performanceRecord.findMany>>;

function groupStoredRowsByCategory(rows: StoredRecordRows): Map<string, StoredRecordRows> {
  const byCategory = new Map<string, StoredRecordRows>();
  for (const row of rows) {
    if (row.group === 'run-effort' || row.group === 'bike-effort') {
      continue;
    }
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  return byCategory;
}

function storedRowsToEntries(list: StoredRecordRows): RecordEntry[] {
  return list
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      rank: r.rank,
      value: r.value,
      displayValue: r.displayValue,
      sublabel: r.sublabel,
      activityId: r.activityId,
      date: r.activityDate.toISOString(),
      title: r.activityTitle,
    }));
}

function buildStoredPowerCurve(rows: StoredRecordRows): PowerCurvePoint[] {
  return rows
    .filter((r) => r.group === 'power')
    .map((r) => ({
      seconds: Number(r.category.replace('power-', '')),
      label: r.label,
      watts: r.value,
      activityId: r.activityId,
      date: r.activityDate.toISOString(),
      title: r.activityTitle,
    }))
    .sort((a, b) => a.seconds - b.seconds);
}

function buildStoredRunBests(rows: StoredRecordRows): RunBestCategory[] {
  const runBestMap = new Map<number, StoredRecordRows>();
  for (const r of rows.filter((x) => x.group === 'run-best')) {
    const meters = Number(r.category.replace('run-best-', ''));
    const list = runBestMap.get(meters) ?? [];
    list.push(r);
    runBestMap.set(meters, list);
  }
  return [...runBestMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([meters, list]) => ({
      meters,
      label: distanceLabel(meters),
      entries: storedRowsToEntries(list),
    }));
}

function assembleStoredRecordsPayload(input: {
  rows: StoredRecordRows;
  totalActivities: number;
  streamsAnalyzed: number;
  runEfforts: RunEffort[];
  bikeEfforts: BikeEffort[];
}): RecordsPayload {
  const { rows, totalActivities, streamsAnalyzed, runEfforts, bikeEfforts } = input;
  const byCategory = groupStoredRowsByCategory(rows);
  const prCategory = (def: PrDef): RecordCategory => ({
    key: def.key,
    label: def.label,
    entries: storedRowsToEntries(byCategory.get(def.key) ?? []),
  });
  const generatedAt = rows.reduce<Date | null>(
    (acc, row) => (!acc || row.createdAt > acc ? row.createdAt : acc),
    null,
  );

  return {
    prs: {
      run: PR_DEFS.filter((d) => d.group === 'run').map(prCategory),
      bike: PR_DEFS.filter((d) => d.group === 'bike').map(prCategory),
      swim: PR_DEFS.filter((d) => d.group === 'swim').map(prCategory),
    },
    powerCurve: buildStoredPowerCurve(rows),
    runBests: buildStoredRunBests(rows),
    runEfforts,
    bikeEfforts,
    streamsAnalyzed,
    totalActivities,
    generatedAt: generatedAt ? generatedAt.toISOString() : null,
  };
}

export async function getStoredRecords(athleteId: string): Promise<RecordsPayload> {
  let rows = await prisma.performanceRecord.findMany({
    where: { athleteId },
    orderBy: [{ category: 'asc' }, { rank: 'asc' }],
  });
  const [totalActivities, streamsAnalyzed] = await Promise.all([
    prisma.activity.count({ where: { athleteId, ...visibleActivityWhere } }),
    prisma.activityStream.count({ where: { available: true, activity: { athleteId } } }),
  ]);

  if (rows.length === 0) {
    if (totalActivities > 0) {
      return recomputeAndStoreRecords(athleteId);
    }
    return emptyPayload(totalActivities, streamsAnalyzed);
  }

  rows = await repairDurationLeadersIfNeeded(athleteId, rows);
  const { runEfforts, bikeEfforts } = await loadStoredEfforts(athleteId, rows, totalActivities);
  return assembleStoredRecordsPayload({
    rows,
    totalActivities,
    streamsAnalyzed,
    runEfforts,
    bikeEfforts,
  });
}
