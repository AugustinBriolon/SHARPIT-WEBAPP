import type { GarminConnect } from '@flow-js/garmin-connect';
import { isSet } from '@sharpit/shared/value';
import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';
import { ActivityType, Prisma } from '@prisma/client';
import {
  garminFeelLabel,
  garminRpeToScale,
} from '@sharpit/server/lib/integrations/garmin/garmin-feel';
import { mergedSource } from '@sharpit/server/lib/activity/list/activity-dedup';
import { resolveGarminExerciseLabel } from '@sharpit/server/lib/integrations/garmin/garmin-exercise-labels';

type GCClient = InstanceType<typeof GarminConnect>;

export interface GarminActivityEvaluation {
  rpe: number | null;
  feeling: string | null;
  notes: string | null;
}

interface GarminActivityDetail {
  summaryDTO?: {
    directWorkoutRpe?: number | null;
    directWorkoutFeel?: number | null;
  };
  description?: string | null;
}

/** Une série de muscu agrégée, prête pour le modèle StrengthSet. */
export interface ParsedStrengthSet {
  exercise: string;
  sets: number;
  reps: number;
  durationSec: number | null;
  weightKg: number | null;
  restSec: number | null;
  order: number;
}

interface GarminExerciseEntry {
  category?: string | null;
  name?: string | null;
  probability?: number | null;
}

interface GarminExerciseSet {
  exercises?: GarminExerciseEntry[];
  duration?: number | null; // secondes
  repetitionCount?: number | null;
  weight?: number | null;
  setType?: string | null; // ACTIVE | REST | WARMUP | ...
  wktStepIndex?: number | null;
}

interface GarminExerciseSetsResponse {
  exerciseSets?: GarminExerciseSet[];
}

interface GarminSummarizedExerciseSet {
  category?: string | null;
  subCategory?: string | null;
  sets?: number | null;
  reps?: number | null;
  duration?: number | null;
  maxWeight?: number | null;
}

/** Garmin envoie le poids en grammes (gros nombres) ou parfois déjà en kg. */
function garminWeightToKg(weight: number | null | undefined): number | null {
  if (weight === undefined || weight === null || weight <= 0) {
    return null;
  }
  if (weight >= 100) {
    return Math.round((weight / 1000) * 10) / 10;
  }
  return Math.round(weight * 10) / 10;
}

function bestExerciseEntry(set: GarminExerciseSet): GarminExerciseEntry | null {
  const exercises = set.exercises ?? [];
  if (exercises.length === 0) {
    return null;
  }
  return exercises.reduce((best, entry) =>
    (entry.probability ?? 0) >= (best.probability ?? 0) ? entry : best,
  );
}

function exerciseKeyFromEntry(entry: GarminExerciseEntry): string {
  const category = entry.category ?? '';
  const name = entry.name ?? '';
  return `${category}::${name || category}`;
}

function labelFromExerciseKey(key: string, labels: Map<string, string>): string {
  const [category, name] = key.split('::');
  if (key.startsWith('step::')) {
    return 'Inconnu';
  }
  return resolveGarminExerciseLabel(category, name, labels);
}

type StrengthGroupPush = {
  groups: ParsedStrengthSet[];
  label: string;
  reps: number[];
  durations: number[];
  weights: number[];
  rests: number[];
  order: number;
};

function pushStrengthGroup(input: StrengthGroupPush): number {
  const { groups, label, reps, durations, weights, rests, order } = input;
  if (reps.length === 0) {
    return order;
  }
  const avgReps = Math.round(reps.reduce((s, v) => s + v, 0) / reps.length);
  const maxWeight = weights.length ? Math.max(...weights) : 0;
  const avgRest = rests.length ? Math.round(rests.reduce((s, v) => s + v, 0) / rests.length) : null;
  const avgDuration = durations.length
    ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
    : null;
  groups.push({
    exercise: label,
    sets: reps.length,
    reps: avgReps,
    durationSec: avgDuration,
    weightKg: garminWeightToKg(maxWeight),
    restSec: avgRest,
    order,
  });
  return order + 1;
}

/**
 * Agrège les exercices résumés fournis dans la liste d'activités Garmin
 * (source fiable pour le décompte par exercice).
 */
function summarizedRepsPerSet(setCount: number, totalReps: number): number {
  if (setCount > 0 && totalReps > 0) {
    return Math.max(1, Math.round(totalReps / setCount));
  }
  if (totalReps > 0) {
    return totalReps;
  }
  return 1;
}

function summarizedDurationSecPerSet(setCount: number, totalDurationMs: number): number | null {
  if (setCount <= 0 || totalDurationMs <= 0) {
    return null;
  }
  return Math.round(totalDurationMs / setCount / 1000);
}

function summarizedSetCount(setCount: number): number {
  return setCount > 0 ? setCount : 1;
}

function buildSummarizedExerciseSet(
  item: GarminSummarizedExerciseSet,
  index: number,
  labels: Map<string, string>,
): ParsedStrengthSet {
  const setCount = item.sets ?? 0;
  const totalReps = item.reps ?? 0;
  const totalDurationMs = item.duration ?? 0;
  const category = item.category?.trim() ?? '';
  const subCategory = item.subCategory?.trim() ?? '';

  return {
    exercise: resolveGarminExerciseLabel(category, subCategory, labels),
    sets: summarizedSetCount(setCount),
    reps: summarizedRepsPerSet(setCount, totalReps),
    durationSec: summarizedDurationSecPerSet(setCount, totalDurationMs),
    weightKg: garminWeightToKg(item.maxWeight),
    restSec: null,
    order: index,
  };
}

function summarizedExerciseEntry(
  item: GarminSummarizedExerciseSet,
  index: number,
  labels: Map<string, string>,
): ParsedStrengthSet | null {
  if (!item.category?.trim() && !item.subCategory?.trim()) {
    return null;
  }
  return buildSummarizedExerciseSet(item, index, labels);
}

export function parseGarminSummarizedExerciseSets(
  activity: IActivity,
  labels: Map<string, string>,
): ParsedStrengthSet[] {
  const raw = activity.summarizedExerciseSets;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  return raw
    .map((entry, index) =>
      summarizedExerciseEntry(entry as GarminSummarizedExerciseSet, index, labels),
    )
    .filter((entry): entry is ParsedStrengthSet => isSet(entry));
}

/**
 * Préfère le détail chronologique par série ; le résumé Garmin sert de secours.
 */
export function resolveGarminStrengthSets(
  activity: IActivity,
  detailedSets: ParsedStrengthSet[],
  labels: Map<string, string>,
): ParsedStrengthSet[] {
  const summarizedSets = parseGarminSummarizedExerciseSets(activity, labels);
  if (detailedSets.length === 0) {
    return summarizedSets;
  }
  if (summarizedSets.length === 0) {
    return detailedSets;
  }

  const detailedLooksBroken =
    detailedSets.length < summarizedSets.length &&
    detailedSets.every(
      (set) =>
        set.exercise === 'Exercice' || set.exercise === 'Unknown' || set.exercise === 'Inconnu',
    );

  return detailedLooksBroken ? summarizedSets : detailedSets;
}

/**
 * Agrège les séries Garmin (une ligne par série + lignes REST) en groupes
 * d'exercices : exercice, nombre de séries, reps moyennes, poids max, repos moyen.
 */
function effectiveRepsFromSet(set: GarminExerciseSet): number {
  const repCount = set.repetitionCount ?? 0;
  const durationSec = isSet(set.duration) && set.duration > 0 ? Math.round(set.duration) : 0;
  if (repCount > 0) {
    return repCount;
  }
  return durationSec > 0 ? 1 : 0;
}

function resolveExerciseSetKey(
  set: GarminExerciseSet,
  entry: GarminExerciseEntry | null,
  currentKey: string | null,
  lastActiveWktStep: number | null,
): string | null {
  let key: string | null = entry ? exerciseKeyFromEntry(entry) : null;
  if (!key && isSet(set.wktStepIndex) && isSet(lastActiveWktStep)) {
    if (set.wktStepIndex !== lastActiveWktStep) {
      key = `step::${set.wktStepIndex}`;
    }
  }
  return key ?? currentKey;
}

class StrengthSetAccumulator {
  readonly groups: ParsedStrengthSet[] = [];
  private currentKey: string | null = null;
  private currentLabel: string | null = null;
  private reps: number[] = [];
  private durations: number[] = [];
  private weights: number[] = [];
  private rests: number[] = [];
  private order = 0;
  private lastActiveWktStep: number | null = null;

  constructor(private readonly labels: Map<string, string>) {}

  flush(): void {
    if (
      this.currentKey === undefined ||
      this.currentKey === null ||
      this.currentLabel === undefined ||
      this.currentLabel === null ||
      this.reps.length === 0
    ) {
      return;
    }
    this.order = pushStrengthGroup({
      groups: this.groups,
      label: this.currentLabel,
      reps: this.reps,
      durations: this.durations,
      weights: this.weights,
      rests: this.rests,
      order: this.order,
    });
    this.resetGroup();
  }

  private resetGroup(): void {
    this.currentKey = null;
    this.currentLabel = null;
    this.reps = [];
    this.durations = [];
    this.weights = [];
    this.rests = [];
  }

  addRest(set: GarminExerciseSet): void {
    if (isSet(set.duration) && set.duration > 0) {
      this.rests.push(set.duration);
    }
  }

  private resolveActiveLabel(entry: GarminExerciseEntry | null, key: string): string {
    if (entry) {
      return labelFromExerciseKey(key, this.labels);
    }
    return this.currentLabel ?? labelFromExerciseKey(key, this.labels);
  }

  private pushTimedDuration(set: GarminExerciseSet): void {
    const durationSec = isSet(set.duration) && set.duration > 0 ? Math.round(set.duration) : 0;
    if (durationSec > 0 && (set.repetitionCount ?? 0) <= 0) {
      this.durations.push(durationSec);
    }
  }

  private pushWeightAndStep(set: GarminExerciseSet): void {
    if (isSet(set.weight) && set.weight > 0) {
      this.weights.push(set.weight);
    }
    if (isSet(set.wktStepIndex)) {
      this.lastActiveWktStep = set.wktStepIndex;
    }
  }

  private trackSetMetrics(set: GarminExerciseSet, effectiveReps: number): void {
    this.reps.push(effectiveReps);
    this.pushTimedDuration(set);
    this.pushWeightAndStep(set);
  }

  addActiveSet(set: GarminExerciseSet): void {
    const entry = bestExerciseEntry(set);
    const key = resolveExerciseSetKey(set, entry, this.currentKey, this.lastActiveWktStep);
    if (!key) {
      return;
    }

    const effectiveReps = effectiveRepsFromSet(set);
    if (effectiveReps <= 0) {
      return;
    }

    if (key !== this.currentKey) {
      this.flush();
      this.currentKey = key;
      this.currentLabel = this.resolveActiveLabel(entry, key);
    }

    this.trackSetMetrics(set, effectiveReps);
  }
}

export function parseGarminExerciseSets(
  body: GarminExerciseSetsResponse,
  labels: Map<string, string>,
): ParsedStrengthSet[] {
  const accumulator = new StrengthSetAccumulator(labels);

  for (const set of body.exerciseSets ?? []) {
    const type = (set.setType ?? '').toUpperCase();
    if (type === 'REST') {
      accumulator.addRest(set);
      continue;
    }
    accumulator.addActiveSet(set);
  }

  accumulator.flush();
  return accumulator.groups;
}

/** Récupère et agrège les séries de muscu d'une activité Garmin. */
export async function fetchGarminExerciseSets(
  client: GCClient,
  activityId: number,
  labels: Map<string, string>,
): Promise<ParsedStrengthSet[]> {
  try {
    const raw = (await client.get(
      `https://connectapi.garmin.com/activity-service/activity/${activityId}/exerciseSets`,
    )) as GarminExerciseSetsResponse;
    return parseGarminExerciseSets(raw, labels);
  } catch (error) {
    console.warn(`[Garmin] exerciseSets fetch failed for activity ${activityId}:`, error);
    return [];
  }
}

/**
 * Durée de séance selon le type.
 * Muscu : temps TOTAL (repos entre séries inclus) → elapsed/duration en priorité.
 * Autres : temps en mouvement (movingDuration) en priorité.
 */
export function garminSessionDurationSec(activity: IActivity, type: ActivityType): number | null {
  if (type === ActivityType.STRENGTH) {
    return garminDurationSec(activity.elapsedDuration, activity.duration, activity.movingDuration);
  }
  return garminDurationSec(activity.movingDuration, activity.duration, activity.elapsedDuration);
}

/**
 * Durées à tenter pour la dédup (moving + elapsed). Apple Santé envoie souvent
 * la durée totale alors que SharpIt stocke le temps en mouvement Garmin.
 */
export function garminDedupDurations(
  activity: IActivity,
  type: ActivityType,
): { duration: number | null; altDurations: number[] } {
  const duration = garminSessionDurationSec(activity, type);
  const alts = [
    garminDurationSec(activity.movingDuration),
    garminDurationSec(activity.duration),
    garminDurationSec(activity.elapsedDuration),
  ].filter((value): value is number => value !== null && value !== duration);
  return { duration, altDurations: [...new Set(alts)] };
}

/** Durée Garmin : secondes ou millisecondes selon le champ / endpoint. */
export function garminDurationSec(...values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (v === undefined || v === null || !Number.isFinite(v) || v <= 0) {
      continue;
    }
    const sec = v > 1_000_000 ? Math.round(v / 1000) : Math.round(v);
    if (sec > 0) {
      return sec;
    }
  }
  return null;
}

const GARMIN_TYPE_RULES: Array<{ matches: (key: string) => boolean; type: ActivityType }> = [
  {
    matches: (k) =>
      k === 'triathlon' ||
      k === 'duathlon' ||
      k === 'multisport' ||
      k === 'multi_sport' ||
      k.includes('triathlon') ||
      k.includes('duathlon') ||
      k.includes('multisport') ||
      k.includes('multi_sport'),
    type: ActivityType.TRIATHLON,
  },
  {
    matches: (k) =>
      k.includes('run') ||
      k === 'trail_running' ||
      k === 'treadmill_running' ||
      k === 'street_running' ||
      k === 'track_running' ||
      k === 'virtual_run',
    type: ActivityType.RUN,
  },
  {
    matches: (k) =>
      k === 'hiking' ||
      k === 'walking' ||
      k === 'mountaineering' ||
      k === 'hike' ||
      (k.includes('hike') && !k.includes('run')) ||
      k.includes('mountaineering'),
    type: ActivityType.HIKE,
  },
  {
    matches: (k) =>
      k.includes('cycl') ||
      k.includes('bike') ||
      k.includes('ride') ||
      k === 'cycling' ||
      k === 'virtual_ride' ||
      k === 'indoor_cycling' ||
      k === 'mountain_biking' ||
      k === 'gravel_cycling',
    type: ActivityType.BIKE,
  },
  {
    matches: (k) => k.includes('swim') || k === 'lap_swimming' || k === 'open_water_swimming',
    type: ActivityType.SWIM,
  },
  {
    matches: (k) =>
      k.includes('strength') ||
      k.includes('hiit') ||
      k.includes('cardio') ||
      k.includes('fitness') ||
      k === 'indoor_cardio' ||
      k === 'yoga' ||
      k === 'pilates',
    type: ActivityType.STRENGTH,
  },
];

export function mapGarminType(typeKey: string): ActivityType | null {
  const key = typeKey.toLowerCase();
  return GARMIN_TYPE_RULES.find(({ matches }) => matches(key))?.type ?? ActivityType.OTHER;
}

export async function fetchGarminActivityEvaluation(
  client: GCClient,
  activityId: number,
): Promise<GarminActivityEvaluation> {
  try {
    const raw = (await client.get(
      `https://connectapi.garmin.com/activity-service/activity/${activityId}`,
    )) as GarminActivityDetail;

    const dto = raw.summaryDTO;
    const rpe = garminRpeToScale(dto?.directWorkoutRpe);
    const feeling = garminFeelLabel(dto?.directWorkoutFeel);
    const notes =
      typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null;

    return { rpe, feeling, notes };
  } catch {
    return { rpe: null, feeling: null, notes: null };
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Garmin's Training Stress Score, and only that.
 *
 * Garmin reports two numbers that used to be coalesced into `Activity.load`:
 *
 * - `trainingStressScore` — Coggan TSS, where 100 is one hour at threshold.
 * - `activityTrainingLoad` — derived from EPOC, on an unrelated scale. Measured on
 *   this database it ran about three times the TSS scale: cycling with a power
 *   meter (real TSS) sat at 49 per hour while runs and swims, which only ever get
 *   the EPOC number, sat at 151 and 161 with a maximum of 772.
 *
 * Storing both in one column made cross-sport load comparison meaningless and
 * silently inflated CTL for whichever sports lacked a power meter. Only the TSS
 * is kept; the EPOC value has no consumer, and the Core computes its own load
 * from raw power and heart rate.
 *
 * @see docs/adr/ADR-002-cross-sport-tss.md
 */
export function garminTrainingStressScore(activity: IActivity): number | null {
  return num(activity.trainingStressScore as number);
}

function garminPaceSecPerKm(activity: IActivity): number | null {
  return activity.averageSpeed && activity.averageSpeed > 0 ? 1000 / activity.averageSpeed : null;
}

function garminElevationLossM(activity: IActivity): number | null {
  const loss = (activity as { elevationLoss?: number }).elevationLoss;
  return typeof loss === 'number' && loss > 0 ? loss : null;
}

type GarminSportMetricsInput = {
  base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'>;
  activity: IActivity;
  type: ActivityType;
  strengthSets: ParsedStrengthSet[];
  load: number | null;
};

function attachGarminRunMetrics(base: GarminSportMetricsInput['base'], activity: IActivity): void {
  base.runMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
      paceSecPerKm: garminPaceSecPerKm(activity),
      avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
      avgPower: num(activity.avgPower as number),
      cadence: activity.averageRunningCadenceInStepsPerMinute
        ? Math.round(activity.averageRunningCadenceInStepsPerMinute)
        : null,
    },
  };
}

function attachGarminHikeMetrics(base: GarminSportMetricsInput['base'], activity: IActivity): void {
  base.hikeMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
      elevationLossM: garminElevationLossM(activity),
      avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
      calories: activity.calories > 0 ? Math.round(activity.calories) : null,
      avgSpeedMps:
        activity.averageSpeed && activity.averageSpeed > 0 ? activity.averageSpeed : null,
    },
  };
}

function attachGarminBikeMetrics(
  base: GarminSportMetricsInput['base'],
  activity: IActivity,
  load: number | null,
): void {
  base.bikeMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      normalizedPower: num(activity.normPower as number),
      avgPower: num(activity.avgPower as number),
      avgCadence: num(activity.averageBikingCadenceInRevPerMinute as number)
        ? Math.round(num(activity.averageBikingCadenceInRevPerMinute as number)!)
        : null,
      elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
      calories: activity.calories > 0 ? Math.round(activity.calories) : null,
      tss: load,
    },
  };
}

function attachGarminSwimMetrics(base: GarminSportMetricsInput['base'], activity: IActivity): void {
  base.swimMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      avgPaceSecPer100m:
        activity.averageSpeed && activity.averageSpeed > 0 ? 100 / activity.averageSpeed : null,
    },
  };
}

function attachGarminStrengthMetrics(
  base: GarminSportMetricsInput['base'],
  strengthSets: ParsedStrengthSet[],
): void {
  if (strengthSets.length === 0) {
    return;
  }
  base.strengthSets = {
    create: strengthSets.map((s) => ({
      exercise: s.exercise,
      sets: s.sets,
      reps: s.reps,
      durationSec: s.durationSec,
      weightKg: s.weightKg,
      restSec: s.restSec,
      order: s.order,
    })),
  };
}

const GARMIN_SPORT_METRIC_ATTACHERS: Partial<
  Record<ActivityType, (input: GarminSportMetricsInput) => void>
> = {
  [ActivityType.RUN]: ({ base, activity }) => attachGarminRunMetrics(base, activity),
  [ActivityType.HIKE]: ({ base, activity }) => attachGarminHikeMetrics(base, activity),
  [ActivityType.BIKE]: ({ base, activity, load }) => attachGarminBikeMetrics(base, activity, load),
  [ActivityType.SWIM]: ({ base, activity }) => attachGarminSwimMetrics(base, activity),
  [ActivityType.STRENGTH]: ({ base, strengthSets }) =>
    attachGarminStrengthMetrics(base, strengthSets),
};

function attachGarminSportMetrics(input: GarminSportMetricsInput): void {
  GARMIN_SPORT_METRIC_ATTACHERS[input.type]?.(input);
}

type GarminEnrichmentInput = {
  data: Prisma.ActivityUpdateInput;
  activity: IActivity;
  load: number | null;
};

function attachGarminEnrichmentRunMetrics(input: GarminEnrichmentInput): void {
  const { data, activity } = input;
  data.runMetrics = {
    upsert: {
      create: {
        distanceM: activity.distance > 0 ? activity.distance : null,
        elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
        paceSecPerKm: garminPaceSecPerKm(activity),
        avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
      },
      update: {
        avgHr: activity.averageHR ? Math.round(activity.averageHR) : undefined,
      },
    },
  };
}

function garminHikeEnrichmentCreate(activity: IActivity) {
  return {
    distanceM: activity.distance > 0 ? activity.distance : null,
    elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
    elevationLossM: garminElevationLossM(activity),
    avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
    calories: activity.calories > 0 ? Math.round(activity.calories) : null,
    avgSpeedMps: activity.averageSpeed && activity.averageSpeed > 0 ? activity.averageSpeed : null,
  };
}

function garminHikeEnrichmentUpdate(activity: IActivity) {
  return {
    distanceM: activity.distance > 0 ? activity.distance : undefined,
    elevationM: activity.elevationGain > 0 ? activity.elevationGain : undefined,
    avgHr: activity.averageHR ? Math.round(activity.averageHR) : undefined,
  };
}

function attachGarminEnrichmentHikeMetrics(input: GarminEnrichmentInput): void {
  const { data, activity } = input;
  data.hikeMetrics = {
    upsert: {
      create: garminHikeEnrichmentCreate(activity),
      update: garminHikeEnrichmentUpdate(activity),
    },
  };
}

function attachGarminEnrichmentBikeMetrics(input: GarminEnrichmentInput): void {
  const { data, activity, load } = input;
  data.bikeMetrics = {
    upsert: {
      create: {
        distanceM: activity.distance > 0 ? activity.distance : null,
        avgPower: num(activity.avgPower as number),
        normalizedPower: num(activity.normPower as number),
        elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
        tss: load,
      },
      update: {
        distanceM: activity.distance > 0 ? activity.distance : undefined,
        tss: load ?? undefined,
      },
    },
  };
}

function attachGarminEnrichmentSwimMetrics(input: GarminEnrichmentInput): void {
  const { data, activity } = input;
  data.swimMetrics = {
    upsert: {
      create: {
        distanceM: activity.distance > 0 ? activity.distance : null,
        avgPaceSecPer100m:
          activity.averageSpeed && activity.averageSpeed > 0 ? 100 / activity.averageSpeed : null,
      },
      update: {
        distanceM: activity.distance > 0 ? activity.distance : undefined,
        avgPaceSecPer100m:
          activity.averageSpeed && activity.averageSpeed > 0
            ? 100 / activity.averageSpeed
            : undefined,
      },
    },
  };
}

const GARMIN_ENRICHMENT_ATTACHERS: Partial<
  Record<ActivityType, (input: GarminEnrichmentInput) => void>
> = {
  [ActivityType.RUN]: attachGarminEnrichmentRunMetrics,
  [ActivityType.HIKE]: attachGarminEnrichmentHikeMetrics,
  [ActivityType.BIKE]: attachGarminEnrichmentBikeMetrics,
  [ActivityType.SWIM]: attachGarminEnrichmentSwimMetrics,
};

function attachGarminEnrichmentMetrics(
  data: Prisma.ActivityUpdateInput,
  activity: IActivity,
  type: ActivityType,
  load: number | null,
): void {
  GARMIN_ENRICHMENT_ATTACHERS[type]?.({ data, activity, load });
}

export function buildGarminActivityData(
  activity: IActivity,
  evaluation: GarminActivityEvaluation,
  type: ActivityType,
  strengthSets: ParsedStrengthSet[] = [],
): Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'> {
  const duration = garminSessionDurationSec(activity, type);
  const load = garminTrainingStressScore(activity);

  const base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'> = {
    type,
    date: new Date(activity.startTimeLocal),
    title: activity.activityName || null,
    duration,
    load,
    rpe: evaluation.rpe,
    feeling: evaluation.feeling,
    notes: evaluation.notes,
    source: 'garmin',
    garminId: String(activity.activityId),
  };

  attachGarminSportMetrics({ base, activity, type, strengthSets, load });
  return base;
}

/** Enrichit une activité existante (souvent importée Strava) avec les données Garmin. */
export function garminEnrichmentUpdate(
  activity: IActivity,
  evaluation: GarminActivityEvaluation,
  type: ActivityType,
  existingStravaId: string | null,
): Prisma.ActivityUpdateInput {
  const duration = garminSessionDurationSec(activity, type);
  const load = garminTrainingStressScore(activity);

  const data: Prisma.ActivityUpdateInput = {
    garminId: String(activity.activityId),
    source: mergedSource(true, Boolean(existingStravaId)),
    title: activity.activityName || undefined,
    duration: duration ?? undefined,
    load: load ?? undefined,
    rpe: evaluation.rpe ?? undefined,
    feeling: evaluation.feeling ?? undefined,
    notes: evaluation.notes ?? undefined,
  };

  attachGarminEnrichmentMetrics(data, activity, type, load);
  return data;
}
