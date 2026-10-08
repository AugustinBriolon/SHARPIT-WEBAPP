import { ActivityType, Prisma } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { syncSinceFromLastSync } from '@sharpit/server/lib/integrations/shared/sync-since';
import { findMatchingActivity } from '@sharpit/server/lib/activity/list/activity-dedup';
import {
  buildGarminActivityData,
  fetchGarminActivityEvaluation,
  fetchGarminExerciseSets,
  garminDedupDurations,
  garminEnrichmentUpdate,
  mapGarminType,
  resolveGarminStrengthSets,
  type ParsedStrengthSet,
} from '@sharpit/server/lib/integrations/garmin/garmin-activities';
import { ensureGarminExerciseLabelsFr } from '@sharpit/server/lib/integrations/garmin/garmin-exercise-labels';
import { fetchGarminMultisportLegs } from '@sharpit/server/lib/integrations/garmin/garmin-multisport';
import { currentTokens } from '@sharpit/server/lib/integrations/garmin/garmin';
import {
  buildFreshGarminClient,
  encryptGarminToken,
  getGarminAccount,
  runGarminCall,
} from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import {
  isGarminAccountConnected,
  ProviderAuthError,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import {
  resolveExerciseCatalogId,
  enrichStrengthExerciseVisuals,
} from '@sharpit/app/lib/exercises';
import { mapWithConcurrency } from '@sharpit/server/lib/async/map-with-concurrency';
import { prisma } from '@sharpit/db/client';
import { removeManualActivityObservations } from '@sharpit/server/lib/observation/manual-observation-sync';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import {
  garminActivityToSession,
  garminEvaluationToSubjective,
} from '@sharpit/server/adapters/garmin-activity-adapter';

/** Parallel per-activity fetch/eval — keep modest (shared Garmin client + rate limits). */
export const GARMIN_ACTIVITY_CONCURRENCY = 4;

/** Fires an observation into the engine. Errors are logged but never propagate to the sync. */
async function ingestGarminActivity(
  athleteId: string,
  activity: Parameters<typeof garminActivityToSession>[0],
  evaluation: Parameters<typeof garminEvaluationToSubjective>[0],
  receivedAt: Date,
): Promise<void> {
  try {
    const rawSession = garminActivityToSession(activity, receivedAt);
    if (!rawSession) {
      return;
    }

    await observationEngine.ingest(athleteId, rawSession);

    const rawSubjective = garminEvaluationToSubjective(
      evaluation,
      String(activity.activityId),
      rawSession.timestamp,
      receivedAt,
    );
    if (rawSubjective) {
      await observationEngine.ingest(athleteId, rawSubjective);
    }
  } catch (err) {
    console.error('[ObservationEngine] garmin-activity ingest failed:', err);
  }
}

const PAGE_SIZE = 50;
/** Limite par défaut (fenêtre glissante) : ~600 activités suffisent largement. */
const MAX_PAGES = 12;
/** Mode historique complet : plafond de sécurité (~10 000 activités). */
const MAX_PAGES_FULL = 200;

async function backfillMultisportLegs(
  activityId: string,
  garminId: number,
  client: Awaited<ReturnType<typeof buildFreshGarminClient>>,
): Promise<boolean> {
  const existing = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { multisportLegs: true },
  });
  if (isSet(existing?.multisportLegs)) {
    return false;
  }

  const legs = await fetchGarminMultisportLegs(client, garminId);
  if (!legs) {
    return false;
  }

  await prisma.activity.update({
    where: { id: activityId },
    data: { multisportLegs: legs as unknown as Prisma.InputJsonValue },
  });
  return true;
}

function strengthSetsMatch(
  existing: Array<{
    exercise: string;
    sets: number;
    reps: number;
    durationSec: number | null;
    weightKg: number | null;
    order: number;
  }>,
  incoming: ParsedStrengthSet[],
): boolean {
  if (existing.length !== incoming.length) {
    return false;
  }
  return existing.every((row, index) => {
    const next = incoming[index];
    if (!next) {
      return false;
    }
    return (
      row.exercise === next.exercise &&
      row.sets === next.sets &&
      row.reps === next.reps &&
      row.durationSec === next.durationSec &&
      row.weightKg === next.weightKg &&
      row.order === next.order
    );
  });
}

/** Crée ou remplace les séries de muscu quand Garmin envoie des données différentes. */
async function backfillStrengthSets(
  activityId: string,
  sets: ParsedStrengthSet[],
): Promise<boolean> {
  if (sets.length === 0) {
    return false;
  }

  const existing = await prisma.strengthSet.findMany({
    where: { activityId },
    orderBy: { order: 'asc' },
  });

  if (strengthSetsMatch(existing, sets)) {
    // Sets unchanged — still fill any missing visual links (new aliases).
    await enrichStrengthExerciseVisuals(prisma, activityId);
    return false;
  }

  await prisma.$transaction([
    prisma.strengthSet.deleteMany({ where: { activityId } }),
    prisma.strengthSet.createMany({
      data: sets.map((s) => ({
        activityId,
        exercise: s.exercise,
        exerciseCatalogId: resolveExerciseCatalogId(s.exercise),
        sets: s.sets,
        reps: s.reps,
        durationSec: s.durationSec,
        weightKg: s.weightKg,
        restSec: s.restSec,
        order: s.order,
      })),
    }),
  ]);
  return true;
}

export interface GarminActivitySyncResult {
  fetched: number;
  imported: number;
  updated: number;
  merged: number;
  skipped: number;
  importedTypes: ActivityType[];
  importedActivityIds: string[];
  /** Types des séances réellement modifiées (import, merge ou update). */
  changedTypes: ActivityType[];
  /** Séances modifiées pendant la sync (pour filtrer les nouveaux records). */
  changedActivityIds: string[];
}

type GarminActivityOutcome = {
  skipped: number;
  imported: number;
  updated: number;
  merged: number;
  importedActivityIds: string[];
  importedTypes: ActivityType[];
  changed: Array<{ id: string; type: ActivityType }>;
};

const EMPTY_OUTCOME: GarminActivityOutcome = {
  skipped: 0,
  imported: 0,
  updated: 0,
  merged: 0,
  importedActivityIds: [],
  importedTypes: [],
  changed: [],
};

type GarminClient = Awaited<ReturnType<typeof buildFreshGarminClient>>;
type GarminListActivity = Parameters<typeof garminActivityToSession>[0];

function buildEvaluationPatch(
  evaluation: Awaited<ReturnType<typeof fetchGarminActivityEvaluation>>,
  existing: { rpe: number | null; feeling: string | null },
): Prisma.ActivityUpdateInput {
  const patch: Prisma.ActivityUpdateInput = {};
  if (isSet(evaluation.rpe) && evaluation.rpe !== existing.rpe) {
    patch.rpe = evaluation.rpe;
  }
  if (isSet(evaluation.feeling) && String(evaluation.feeling) !== String(existing.feeling)) {
    patch.feeling = String(evaluation.feeling);
  }
  if (evaluation.notes) {
    patch.notes = evaluation.notes;
  }
  return patch;
}

type HandleExistingGarminInput = {
  existing: { id: string; rpe: number | null; feeling: string | null };
  evaluation: Awaited<ReturnType<typeof fetchGarminActivityEvaluation>>;
  strengthSets: ParsedStrengthSet[];
  type: ActivityType;
  activityId: number;
  client: GarminClient;
};

async function handleExistingGarminActivity(
  input: HandleExistingGarminInput,
): Promise<GarminActivityOutcome> {
  const { existing, evaluation, strengthSets, type, activityId, client } = input;
  const patch = buildEvaluationPatch(evaluation, existing);
  const addedSets = await backfillStrengthSets(existing.id, strengthSets);
  const addedLegs =
    type === ActivityType.TRIATHLON
      ? await backfillMultisportLegs(existing.id, activityId, client)
      : false;

  if (Object.keys(patch).length > 0) {
    await prisma.activity.update({ where: { id: existing.id }, data: patch });
    return { ...EMPTY_OUTCOME, updated: 1, changed: [{ id: existing.id, type }] };
  }
  if (addedSets || addedLegs) {
    return { ...EMPTY_OUTCOME, updated: 1, changed: [{ id: existing.id, type }] };
  }
  return { ...EMPTY_OUTCOME, skipped: 1 };
}

type MergeGarminActivityInput = {
  athleteId: string;
  match: NonNullable<Awaited<ReturnType<typeof findMatchingActivity>>>;
  activity: GarminListActivity;
  evaluation: Awaited<ReturnType<typeof fetchGarminActivityEvaluation>>;
  type: ActivityType;
  strengthSets: ParsedStrengthSet[];
  garminId: string;
};

async function mergeGarminActivityMatch(
  input: MergeGarminActivityInput,
): Promise<GarminActivityOutcome> {
  const { athleteId, match, activity, evaluation, type, strengthSets, garminId } = input;
  if (match.garminId && match.garminId !== garminId) {
    return { ...EMPTY_OUTCOME, skipped: 1 };
  }

  await prisma.activity.update({
    where: { id: match.id },
    data: garminEnrichmentUpdate(activity, evaluation, type, match.stravaId, match.source),
  });
  await backfillStrengthSets(match.id, strengthSets);
  // Do not delete streams here — a failed Garmin fetch would leave the row without series.
  // getActivityStreams retries when garminId is set and replaces stubs / older series on demand.
  // A session first sent by Apple Health (or merged Strava onto AH) went to the Core without a
  // provider id; Garmin's own session replaces it, so the day's load is not counted twice (ADR-054).
  if (!match.garminId) {
    await removeManualActivityObservations(athleteId, match.id);
  }
  await ingestGarminActivity(athleteId, activity, evaluation, new Date());
  return {
    ...EMPTY_OUTCOME,
    merged: 1,
    importedActivityIds: [match.id],
    changed: [{ id: match.id, type }],
  };
}

type ImportGarminActivityInput = {
  athleteId: string;
  client: GarminClient;
  activity: GarminListActivity;
  evaluation: Awaited<ReturnType<typeof fetchGarminActivityEvaluation>>;
  type: ActivityType;
  strengthSets: ParsedStrengthSet[];
};

async function importGarminActivityRecord(
  input: ImportGarminActivityInput,
): Promise<GarminActivityOutcome> {
  const { athleteId, client, activity, evaluation, type, strengthSets } = input;
  try {
    const multisportLegs =
      type === ActivityType.TRIATHLON
        ? await fetchGarminMultisportLegs(client, activity.activityId)
        : null;

    const created = await prisma.activity.create({
      data: {
        ...buildGarminActivityData(activity, evaluation, type, strengthSets),
        athleteId,
        ...(multisportLegs
          ? { multisportLegs: multisportLegs as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    await ingestGarminActivity(athleteId, activity, evaluation, new Date());
    return {
      ...EMPTY_OUTCOME,
      imported: 1,
      importedActivityIds: [created.id],
      importedTypes: [type],
      changed: [{ id: created.id, type }],
    };
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ...EMPTY_OUTCOME, skipped: 1 };
    }
    throw error;
  }
}

async function processOneGarminActivity(
  athleteId: string,
  client: GarminClient,
  activity: GarminListActivity,
  exerciseLabelsFr: Map<string, string>,
): Promise<GarminActivityOutcome> {
  const garminId = String(activity.activityId);
  const type = mapGarminType(activity.activityType?.typeKey ?? '');
  if (!type) {
    return { ...EMPTY_OUTCOME, skipped: 1 };
  }

  const { duration, altDurations } = garminDedupDurations(activity, type);
  const evaluation = await fetchGarminActivityEvaluation(client, activity.activityId);
  const strengthSets =
    type === ActivityType.STRENGTH
      ? resolveGarminStrengthSets(
          activity,
          await fetchGarminExerciseSets(client, activity.activityId, exerciseLabelsFr),
          exerciseLabelsFr,
        )
      : [];

  const existingByGarmin = await prisma.activity.findFirst({
    where: { garminId, athleteId },
    select: { id: true, rpe: true, feeling: true, stravaId: true },
  });

  if (existingByGarmin) {
    return handleExistingGarminActivity({
      existing: existingByGarmin,
      evaluation,
      strengthSets,
      type,
      activityId: activity.activityId,
      client,
    });
  }

  const match = await findMatchingActivity(athleteId, {
    type,
    date: new Date(activity.startTimeLocal),
    duration,
    altDurations,
    distanceM: activity.distance > 0 ? activity.distance : null,
    garminId,
  });

  if (match) {
    return mergeGarminActivityMatch({
      athleteId,
      match,
      activity,
      evaluation,
      type,
      strengthSets,
      garminId,
    });
  }

  return importGarminActivityRecord({
    athleteId,
    client,
    activity,
    evaluation,
    type,
    strengthSets,
  });
}

function mergeGarminActivityOutcome(input: {
  result: GarminActivitySyncResult;
  outcome: GarminActivityOutcome;
  importedTypes: Set<ActivityType>;
  changedTypes: Set<ActivityType>;
  changedActivityIds: Set<string>;
}): void {
  const { result, outcome, importedTypes, changedTypes, changedActivityIds } = input;
  result.skipped += outcome.skipped;
  result.imported += outcome.imported;
  result.updated += outcome.updated;
  result.merged += outcome.merged;
  result.importedActivityIds.push(...outcome.importedActivityIds);
  for (const type of outcome.importedTypes) {
    importedTypes.add(type);
  }
  for (const change of outcome.changed) {
    changedTypes.add(change.type);
    changedActivityIds.add(change.id);
  }
}

function activitiesWithinCutoff(
  batch: GarminListActivity[],
  cutoff: Date | null,
): { toProcess: GarminListActivity[]; reachedCutoff: boolean } {
  const toProcess: GarminListActivity[] = [];
  for (const activity of batch) {
    const date = new Date(activity.startTimeLocal);
    if (cutoff && date < cutoff) {
      return { toProcess, reachedCutoff: true };
    }
    toProcess.push(activity);
  }
  return { toProcess, reachedCutoff: false };
}

async function processGarminSyncPage(input: {
  athleteId: string;
  client: GarminClient;
  exerciseLabelsFr: Map<string, string>;
  batch: GarminListActivity[];
  cutoff: Date | null;
  result: GarminActivitySyncResult;
  importedTypes: Set<ActivityType>;
  changedTypes: Set<ActivityType>;
  changedActivityIds: Set<string>;
}): Promise<{ reachedCutoff: boolean; batchSize: number }> {
  const {
    athleteId,
    client,
    exerciseLabelsFr,
    batch,
    cutoff,
    result,
    importedTypes,
    changedTypes,
    changedActivityIds,
  } = input;

  result.fetched += batch.length;
  const { toProcess, reachedCutoff } = activitiesWithinCutoff(batch, cutoff);

  const outcomes = await mapWithConcurrency(toProcess, GARMIN_ACTIVITY_CONCURRENCY, (activity) =>
    processOneGarminActivity(athleteId, client, activity, exerciseLabelsFr),
  );

  for (const outcome of outcomes) {
    mergeGarminActivityOutcome({
      result,
      outcome,
      importedTypes,
      changedTypes,
      changedActivityIds,
    });
  }

  return { reachedCutoff, batchSize: batch.length };
}

interface FinalizeGarminActivitySyncInput {
  athleteId: string;
  client: GarminClient;
  result: GarminActivitySyncResult;
  importedTypes: Set<ActivityType>;
  changedTypes: Set<ActivityType>;
  changedActivityIds: Set<string>;
}

async function finalizeGarminActivitySync(
  input: FinalizeGarminActivitySyncInput,
): Promise<GarminActivitySyncResult> {
  const { athleteId, client, result, importedTypes, changedTypes, changedActivityIds } = input;
  const refreshed = currentTokens(client);
  await prisma.garminAccount.update({
    where: { athleteId },
    data: {
      oauth1TokenEnc: encryptGarminToken(refreshed.oauth1),
      oauth2TokenEnc: encryptGarminToken(refreshed.oauth2),
      lastActivitySyncAt: new Date(),
    },
  });

  result.importedTypes = [...importedTypes];
  result.changedTypes = [...changedTypes];
  result.changedActivityIds = [...changedActivityIds];
  return result;
}

async function paginateGarminActivities(input: {
  client: GarminClient;
  athleteId: string;
  exerciseLabelsFr: Map<string, string>;
  cutoff: Date | null;
  maxPages: number;
  result: GarminActivitySyncResult;
  importedTypes: Set<ActivityType>;
  changedTypes: Set<ActivityType>;
  changedActivityIds: Set<string>;
}): Promise<void> {
  let start = 0;
  for (let page = 0; page < input.maxPages; page++) {
    const batch = await input.client.getActivities(start, PAGE_SIZE);
    if (!batch.length) {
      break;
    }

    const { reachedCutoff, batchSize } = await processGarminSyncPage({
      athleteId: input.athleteId,
      client: input.client,
      exerciseLabelsFr: input.exerciseLabelsFr,
      batch,
      cutoff: input.cutoff,
      result: input.result,
      importedTypes: input.importedTypes,
      changedTypes: input.changedTypes,
      changedActivityIds: input.changedActivityIds,
    });

    if (reachedCutoff || batchSize < PAGE_SIZE) {
      break;
    }
    start += PAGE_SIZE;
  }
}

function resolveGarminSyncCutoff(input: {
  full: boolean;
  since?: Date;
  lastActivitySync: Date | null;
  sinceDays?: number;
}): Date | null {
  if (input.full) {
    return null;
  }
  return input.since ?? syncSinceFromLastSync(input.lastActivitySync, input.sinceDays ?? 60);
}

function createGarminActivitySyncState(options?: {
  sinceDays?: number;
  since?: Date;
  full?: boolean;
  lastActivitySync: Date | null;
}) {
  const full = options?.full ?? false;
  return {
    full,
    cutoff: resolveGarminSyncCutoff({
      full,
      since: options?.since,
      lastActivitySync: options?.lastActivitySync ?? null,
      sinceDays: options?.sinceDays,
    }),
    maxPages: full ? MAX_PAGES_FULL : MAX_PAGES,
    result: {
      fetched: 0,
      imported: 0,
      updated: 0,
      merged: 0,
      skipped: 0,
      importedTypes: [] as ActivityType[],
      importedActivityIds: [] as string[],
      changedTypes: [] as ActivityType[],
      changedActivityIds: [] as string[],
    } satisfies GarminActivitySyncResult,
    importedTypes: new Set<ActivityType>(),
    changedTypes: new Set<ActivityType>(),
    changedActivityIds: new Set<string>(),
  };
}

async function runGarminActivitySync(
  athleteId: string,
  options?: {
    sinceDays?: number;
    since?: Date;
    full?: boolean;
  },
): Promise<GarminActivitySyncResult> {
  const account = await getGarminAccount(athleteId);
  if (!account || !isGarminAccountConnected(account)) {
    throw new ProviderAuthError('Session Garmin expirée. Reconnecte Garmin dans les paramètres.');
  }

  const client = await buildFreshGarminClient(athleteId, account);
  const exerciseLabelsFr = await ensureGarminExerciseLabelsFr();
  const syncState = createGarminActivitySyncState({
    ...options,
    lastActivitySync: account.lastActivitySyncAt ?? account.lastSyncAt,
  });

  await paginateGarminActivities({
    client,
    athleteId,
    exerciseLabelsFr,
    cutoff: syncState.cutoff,
    maxPages: syncState.maxPages,
    result: syncState.result,
    importedTypes: syncState.importedTypes,
    changedTypes: syncState.changedTypes,
    changedActivityIds: syncState.changedActivityIds,
  });

  return finalizeGarminActivitySync({
    athleteId,
    client,
    result: syncState.result,
    importedTypes: syncState.importedTypes,
    changedTypes: syncState.changedTypes,
    changedActivityIds: syncState.changedActivityIds,
  });
}

export async function syncGarminActivities(
  athleteId: string,
  options?: {
    /** Fenêtre en jours (fallback si jamais sync). Ignoré si `full` ou `since`. */
    sinceDays?: number;
    /** Borne basse explicite (prioritaire sur sinceDays). */
    since?: Date;
    /** Récupère tout l'historique (aucune limite de date). */
    full?: boolean;
  },
): Promise<GarminActivitySyncResult> {
  const { isProviderEnabledForClass } = await import('@sharpit/app/lib/integrations/source-prefs');
  const { loadResolvedSourcePrefs } =
    await import('@sharpit/server/lib/integrations/source-prefs-store');
  const prefs = await loadResolvedSourcePrefs(athleteId);
  if (!isProviderEnabledForClass(prefs, 'activities', 'garmin')) {
    return {
      fetched: 0,
      imported: 0,
      updated: 0,
      merged: 0,
      skipped: 0,
      importedTypes: [],
      importedActivityIds: [],
      changedTypes: [],
      changedActivityIds: [],
    };
  }

  return runGarminCall(athleteId, () => runGarminActivitySync(athleteId, options));
}
