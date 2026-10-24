import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { isSet } from '@sharpit/shared/value';
import { resolveBriefingPhase } from '@sharpit/server/lib/briefing/briefing-phase';
import type {
  AthleteFreshnessSnapshot,
  AthleteStateDomain,
  DomainFreshness,
  FreshnessLevel,
  ProviderFreshness,
} from '@sharpit/app/athlete-state/freshness';
import { prisma } from '@sharpit/db/client';
import {
  pickPrimaryProductMessage,
  productMessageForDomain,
} from '@sharpit/server/lib/athlete-state/product-states';
import {
  GARMIN_CONNECTION_SELECT,
  OAUTH_CONNECTION_SELECT,
  RENPHO_CONNECTION_SELECT,
  isGarminAccountConnected,
  isOAuthAccountConnected,
  isRenphoAccountConnected,
} from '@sharpit/server/lib/integrations/shared/connection-status';

type TwinState = { computedAt?: string | Date } | null;

function readComputedAt(state: unknown): Date | null {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const raw = (state as TwinState)?.computedAt;
  if (!raw) {
    return null;
  }
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isStale(computed: Date | null, evidence: Date | null): boolean {
  if (!evidence) {
    return false;
  }
  if (!computed) {
    return true;
  }
  return evidence > computed;
}

function hoursSince(date: Date | null): number | null {
  if (!date) {
    return null;
  }
  return (Date.now() - date.getTime()) / 3_600_000;
}

/** Activity providers (Garmin / Strava) — near-realtime pull without webhooks. */
export const ACTIVITY_PROVIDER_STALE_HOURS = 0.5;
/** Body scales — daily is enough. */
export const BODY_PROVIDER_STALE_HOURS = 24;
/** Calendar — keep aligned with planning day. */
export const PLANNING_PROVIDER_STALE_HOURS = 2;

function providerStale(lastSync: Date | null | undefined, thresholdHours: number): boolean {
  if (!lastSync) {
    return true;
  }
  return hoursSince(lastSync)! > thresholdHours;
}

/** Oldest sync timestamp — missing activity sync counts as never synced. */
export function garminSyncReference(
  lastSyncAt: Date | null | undefined,
  lastActivitySyncAt: Date | null | undefined,
): Date | null {
  if (!lastActivitySyncAt) {
    return null;
  }
  if (!lastSyncAt) {
    return lastActivitySyncAt;
  }
  return lastSyncAt.getTime() <= lastActivitySyncAt.getTime() ? lastSyncAt : lastActivitySyncAt;
}

type ComputingFlags = Partial<Record<AthleteStateDomain, boolean>>;
type SyncingFlags = Partial<Record<string, boolean>>;

function syncOrComputing(computing: boolean, syncing: boolean): FreshnessLevel | null {
  if (!computing && !syncing) {
    return null;
  }
  if (computing) {
    return 'computing';
  }
  return 'syncing';
}

function resolveSleepFreshness(
  syncingGarmin: boolean,
  expectSleep: boolean,
  sleepEvidence: Date | null,
  recoveryAt: Date | null,
): FreshnessLevel {
  if (syncingGarmin) {
    return 'syncing';
  }
  if (expectSleep && !sleepEvidence) {
    return 'awaiting_data';
  }
  if (isStale(recoveryAt, sleepEvidence)) {
    return 'stale';
  }
  if (recoveryAt) {
    return 'fresh';
  }
  return 'awaiting_data';
}

type RecoveryFreshnessInput = {
  computingRecovery: boolean;
  syncingGarmin: boolean;
  recoveryAt: Date | null;
  sleepEvidence: Date | null;
  subjectiveEvidence: Date | null;
};

function resolveRecoveryFreshness(input: RecoveryFreshnessInput): FreshnessLevel {
  const { computingRecovery, syncingGarmin, recoveryAt, sleepEvidence, subjectiveEvidence } = input;
  const busy = syncOrComputing(computingRecovery, syncingGarmin);
  if (busy) {
    return busy;
  }
  if (!recoveryAt) {
    return 'unavailable';
  }
  if (isStale(recoveryAt, sleepEvidence) || isStale(recoveryAt, subjectiveEvidence)) {
    return 'stale';
  }
  return 'fresh';
}

type TrainingFreshnessInput = {
  computingTraining: boolean;
  syncingGarmin: boolean;
  syncingStrava: boolean;
  sessionEvidence: Date | null;
  dailyStrainUpdatedAt: Date | null;
  dailyStrainAvailable: boolean;
};

function isTrainingEvidenceStale(input: TrainingFreshnessInput): boolean {
  const { sessionEvidence, dailyStrainUpdatedAt } = input;
  return Boolean(sessionEvidence && dailyStrainUpdatedAt && sessionEvidence > dailyStrainUpdatedAt);
}

function resolveTrainingFreshness(input: TrainingFreshnessInput): FreshnessLevel {
  const { computingTraining, syncingGarmin, syncingStrava, sessionEvidence, dailyStrainAvailable } =
    input;
  const busy = syncOrComputing(computingTraining, syncingGarmin || syncingStrava);
  if (busy) {
    return busy;
  }
  if (isTrainingEvidenceStale(input)) {
    return 'stale';
  }
  if (sessionEvidence && !dailyStrainAvailable) {
    return 'computing';
  }
  if (dailyStrainAvailable || sessionEvidence) {
    return 'fresh';
  }
  return 'awaiting_data';
}

type ReasoningFreshnessInput = {
  computingReasoning: boolean;
  reasoningAt: Date | null;
  recoveryAt: Date | null;
  fatigueAt: Date | null;
  adaptationAt: Date | null;
};

function resolveReasoningFreshness(input: ReasoningFreshnessInput): FreshnessLevel {
  const { computingReasoning, reasoningAt, recoveryAt, fatigueAt, adaptationAt } = input;
  if (computingReasoning) {
    return 'computing';
  }
  if (!reasoningAt) {
    return 'unavailable';
  }
  if (
    isStale(reasoningAt, recoveryAt) ||
    isStale(reasoningAt, fatigueAt) ||
    isStale(reasoningAt, adaptationAt)
  ) {
    return 'stale';
  }
  return 'fresh';
}

type RecommendationsFreshnessInput = {
  computingRecommendations: boolean;
  briefingAt: Date | null;
  reasoningAt: Date | null;
  sessionEvidence: Date | null;
  phaseAtGeneration: string | null;
  currentBriefingPhase: string;
};

function isRecommendationsStale(input: RecommendationsFreshnessInput): boolean {
  const { briefingAt, reasoningAt, sessionEvidence, phaseAtGeneration, currentBriefingPhase } =
    input;
  if (!briefingAt) {
    return false;
  }
  if (reasoningAt && briefingAt < reasoningAt) {
    return true;
  }
  if (sessionEvidence && briefingAt < sessionEvidence) {
    return true;
  }
  return Boolean(phaseAtGeneration && phaseAtGeneration !== currentBriefingPhase);
}

export function resolveRecommendationsFreshness(
  input: RecommendationsFreshnessInput,
): FreshnessLevel {
  if (input.computingRecommendations) {
    return 'computing';
  }
  if (!input.briefingAt) {
    return 'awaiting_data';
  }
  if (isRecommendationsStale(input)) {
    return 'stale';
  }
  return 'fresh';
}

type BodyFreshnessInput = {
  syncingRenpho: boolean;
  syncingWithings: boolean;
  renphoConnected: boolean;
  withingsConnected: boolean;
  bodyEvidence: Date | null;
};

function resolveBodyFreshness(input: BodyFreshnessInput): FreshnessLevel {
  const { syncingRenpho, syncingWithings, renphoConnected, withingsConnected, bodyEvidence } =
    input;
  if (syncingRenpho || syncingWithings) {
    return 'syncing';
  }
  if (!renphoConnected && !withingsConnected) {
    return 'unavailable';
  }
  if (bodyEvidence && hoursSince(bodyEvidence)! < 24 * 14) {
    return 'fresh';
  }
  return 'awaiting_data';
}

function resolvePlanningFreshness(
  syncingGoogle: boolean,
  googleLastSync: Date | null,
): FreshnessLevel {
  if (syncingGoogle) {
    return 'syncing';
  }
  if (googleLastSync) {
    return 'fresh';
  }
  return 'awaiting_data';
}

async function loadFreshnessQueryData(athleteId: string, trainingDayId: string) {
  return Promise.all([
    prisma.digitalTwin.findUnique({ where: { athleteId } }),
    prisma.observation.findFirst({
      where: { athleteId, type: 'SLEEP', trainingDayId },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    }),
    prisma.observation.findFirst({
      where: { athleteId, type: 'SESSION', trainingDayId },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    }),
    prisma.observation.findFirst({
      where: { athleteId, type: 'SUBJECTIVE', trainingDayId, source: 'MANUAL' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    }),
    prisma.observation.findFirst({
      where: { athleteId, type: 'BODY_COMPOSITION' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    }),
    prisma.stravaAccount.findUnique({
      where: { athleteId },
      select: { lastSyncAt: true, ...OAUTH_CONNECTION_SELECT },
    }),
    prisma.garminAccount.findUnique({
      where: { athleteId },
      select: { lastSyncAt: true, lastActivitySyncAt: true, ...GARMIN_CONNECTION_SELECT },
    }),
    prisma.renphoAccount.findUnique({
      where: { athleteId },
      select: { lastSyncAt: true, ...RENPHO_CONNECTION_SELECT },
    }),
    prisma.withingsAccount.findUnique({
      where: { athleteId },
      select: { lastSyncAt: true, ...OAUTH_CONNECTION_SELECT },
    }),
    prisma.googleAccount.findUnique({
      where: { athleteId },
      select: { lastSyncAt: true, ...OAUTH_CONNECTION_SELECT },
    }),
    prisma.dailyBriefing.findFirst({
      where: { athleteId, date: new Date(`${trainingDayId}T12:00:00.000Z`) },
      select: { generatedAt: true, phaseAtGeneration: true },
    }),
    prisma.athleteSnapshotRecord.findUnique({
      where: {
        athleteId_trainingDayId: { athleteId, trainingDayId },
      },
      select: { generatedAt: true, payload: true },
    }),
  ]);
}

type FreshnessQueryData = Awaited<ReturnType<typeof loadFreshnessQueryData>>;

function buildAccountProviderFreshness(input: {
  provider: ProviderFreshness['provider'];
  connected: boolean;
  lastSyncAt: Date | null | undefined;
  staleHours: number;
  syncing: boolean;
}): ProviderFreshness {
  return {
    provider: input.provider,
    connected: input.connected,
    lastSyncAt: input.lastSyncAt?.toISOString() ?? null,
    stale: input.connected && providerStale(input.lastSyncAt ?? null, input.staleHours),
    syncing: input.syncing,
  };
}

function buildProviderFreshnessList(
  accounts: {
    strava: FreshnessQueryData[5];
    garmin: FreshnessQueryData[6];
    renpho: FreshnessQueryData[7];
    withings: FreshnessQueryData[8];
    google: FreshnessQueryData[9];
  },
  syncing: SyncingFlags,
): ProviderFreshness[] {
  const { strava, garmin, renpho, withings, google } = accounts;
  const garminLastSync = garminSyncReference(garmin?.lastSyncAt, garmin?.lastActivitySyncAt);

  return [
    buildAccountProviderFreshness({
      provider: 'garmin',
      connected: isGarminAccountConnected(garmin),
      lastSyncAt: garminLastSync,
      staleHours: ACTIVITY_PROVIDER_STALE_HOURS,
      syncing: syncing.garmin === true,
    }),
    buildAccountProviderFreshness({
      provider: 'strava',
      connected: isOAuthAccountConnected(strava),
      lastSyncAt: strava?.lastSyncAt,
      staleHours: ACTIVITY_PROVIDER_STALE_HOURS,
      syncing: syncing.strava === true,
    }),
    buildAccountProviderFreshness({
      provider: 'renpho',
      connected: isRenphoAccountConnected(renpho),
      lastSyncAt: renpho?.lastSyncAt,
      staleHours: BODY_PROVIDER_STALE_HOURS,
      syncing: syncing.renpho === true,
    }),
    buildAccountProviderFreshness({
      provider: 'withings',
      connected: isOAuthAccountConnected(withings),
      lastSyncAt: withings?.lastSyncAt,
      staleHours: BODY_PROVIDER_STALE_HOURS,
      syncing: syncing.withings === true,
    }),
    buildAccountProviderFreshness({
      provider: 'google',
      connected: isOAuthAccountConnected(google),
      lastSyncAt: google?.lastSyncAt,
      staleHours: PLANNING_PROVIDER_STALE_HOURS,
      syncing: syncing.google === true,
    }),
  ];
}

function makeDomainFreshness(input: {
  computing: ComputingFlags;
  domainName: AthleteStateDomain;
  lastUpdatedAt: Date | null;
  freshness: FreshnessLevel;
  state: string;
}): DomainFreshness {
  const effectiveFreshness = input.computing[input.domainName] ? 'computing' : input.freshness;
  return {
    domain: input.domainName,
    lastUpdatedAt: input.lastUpdatedAt?.toISOString() ?? null,
    freshness: effectiveFreshness,
    state: input.state,
    productMessage: productMessageForDomain(input.domainName, effectiveFreshness),
  };
}

function readTwinComputedTimes(twin: FreshnessQueryData[0]) {
  return {
    recoveryAt: readComputedAt(twin?.recoveryState),
    fatigueAt: readComputedAt(twin?.fatigueState),
    adaptationAt: readComputedAt(twin?.adaptationState),
    reasoningAt: readComputedAt(twin?.reasoningState),
    physicalHealthAt: readComputedAt(twin?.physicalHealthState),
    environmentAt: readComputedAt(twin?.environmentalStateMeta),
  };
}

function readDailyStrainEvidence(latestSnapshot: FreshnessQueryData[11]) {
  const snapshotPayload = latestSnapshot?.payload as
    { dailyStrain?: { available?: boolean; strainScore?: number | null } } | undefined;
  const dailyStrainAvailable = Boolean(
    snapshotPayload?.dailyStrain?.available && isSet(snapshotPayload.dailyStrain.strainScore),
  );
  const dailyStrainUpdatedAt =
    dailyStrainAvailable && latestSnapshot?.generatedAt ? latestSnapshot.generatedAt : null;
  return { dailyStrainAvailable, dailyStrainUpdatedAt };
}

function readObservationTimestamp(entry: { timestamp: Date } | null | undefined): Date | null {
  return entry?.timestamp ?? null;
}

function readObservationEvidence(input: {
  latestSleep: FreshnessQueryData[1];
  latestSession: FreshnessQueryData[2];
  latestSubjective: FreshnessQueryData[3];
  latestBody: FreshnessQueryData[4];
  latestSnapshot: FreshnessQueryData[11];
}) {
  const sessionEvidence = readObservationTimestamp(input.latestSession);
  const { dailyStrainAvailable, dailyStrainUpdatedAt } = readDailyStrainEvidence(
    input.latestSnapshot,
  );

  return {
    sleepEvidence: readObservationTimestamp(input.latestSleep),
    sessionEvidence,
    subjectiveEvidence: readObservationTimestamp(input.latestSubjective),
    bodyEvidence: readObservationTimestamp(input.latestBody),
    dailyStrainAvailable,
    dailyStrainUpdatedAt,
    trainingEvidenceAt: sessionEvidence ?? dailyStrainUpdatedAt,
  };
}

function readFreshnessEvidence(input: {
  twin: FreshnessQueryData[0];
  latestSleep: FreshnessQueryData[1];
  latestSession: FreshnessQueryData[2];
  latestSubjective: FreshnessQueryData[3];
  latestBody: FreshnessQueryData[4];
  latestSnapshot: FreshnessQueryData[11];
}) {
  return {
    ...readTwinComputedTimes(input.twin),
    ...readObservationEvidence(input),
  };
}

function buildCoreDomainFreshnessList(input: {
  computing: ComputingFlags;
  syncing: SyncingFlags;
  evidence: ReturnType<typeof readFreshnessEvidence>;
  renpho: FreshnessQueryData[7];
  withings: FreshnessQueryData[8];
}): DomainFreshness[] {
  const { computing, syncing, evidence, renpho, withings } = input;
  return [
    makeDomainFreshness({
      computing,
      domainName: 'sleep',
      lastUpdatedAt: evidence.recoveryAt,
      freshness: resolveSleepFreshness(
        syncing.garmin === true,
        new Date().getHours() < 14,
        evidence.sleepEvidence,
        evidence.recoveryAt,
      ),
      state: `sleep_obs=${isSet(evidence.sleepEvidence)}`,
    }),
    makeDomainFreshness({
      computing,
      domainName: 'recovery',
      lastUpdatedAt: evidence.recoveryAt,
      freshness: resolveRecoveryFreshness({
        computingRecovery: computing.recovery === true,
        syncingGarmin: syncing.garmin === true,
        recoveryAt: evidence.recoveryAt,
        sleepEvidence: evidence.sleepEvidence,
        subjectiveEvidence: evidence.subjectiveEvidence,
      }),
      state: `recovery_computed=${isSet(evidence.recoveryAt)}`,
    }),
    makeDomainFreshness({
      computing,
      domainName: 'training',
      lastUpdatedAt: evidence.trainingEvidenceAt,
      freshness: resolveTrainingFreshness({
        computingTraining: computing.training === true,
        syncingGarmin: syncing.garmin === true,
        syncingStrava: syncing.strava === true,
        sessionEvidence: evidence.sessionEvidence,
        dailyStrainUpdatedAt: evidence.dailyStrainUpdatedAt,
        dailyStrainAvailable: evidence.dailyStrainAvailable,
      }),
      state: `session_obs=${isSet(evidence.sessionEvidence)},strain=${evidence.dailyStrainAvailable}`,
    }),
    makeDomainFreshness({
      computing,
      domainName: 'body',
      lastUpdatedAt: evidence.bodyEvidence,
      freshness: resolveBodyFreshness({
        syncingRenpho: syncing.renpho === true,
        syncingWithings: syncing.withings === true,
        renphoConnected: isRenphoAccountConnected(renpho),
        withingsConnected: isOAuthAccountConnected(withings),
        bodyEvidence: evidence.bodyEvidence,
      }),
      state: `body_obs=${isSet(evidence.bodyEvidence)}`,
    }),
  ];
}

function buildPhysicalEnvironmentDomains(input: {
  computing: ComputingFlags;
  evidence: ReturnType<typeof readFreshnessEvidence>;
}): DomainFreshness[] {
  return [
    makeDomainFreshness({
      computing: input.computing,
      domainName: 'physical',
      lastUpdatedAt: input.evidence.physicalHealthAt,
      freshness: input.evidence.physicalHealthAt ? 'fresh' : 'awaiting_data',
      state: `physical_computed=${isSet(input.evidence.physicalHealthAt)}`,
    }),
    makeDomainFreshness({
      computing: input.computing,
      domainName: 'environment',
      lastUpdatedAt: input.evidence.environmentAt,
      freshness: input.evidence.environmentAt ? 'fresh' : 'awaiting_data',
      state: `environment_computed=${isSet(input.evidence.environmentAt)}`,
    }),
  ];
}

function buildRecommendationsDomain(input: {
  computing: ComputingFlags;
  evidence: ReturnType<typeof readFreshnessEvidence>;
  briefing: FreshnessQueryData[10];
}): DomainFreshness {
  const briefingAt = input.briefing?.generatedAt ?? null;
  return makeDomainFreshness({
    computing: input.computing,
    domainName: 'recommendations',
    lastUpdatedAt: briefingAt,
    freshness: resolveRecommendationsFreshness({
      computingRecommendations: input.computing.recommendations === true,
      briefingAt,
      reasoningAt: input.evidence.reasoningAt,
      sessionEvidence: input.evidence.sessionEvidence,
      phaseAtGeneration: input.briefing?.phaseAtGeneration ?? null,
      currentBriefingPhase: resolveBriefingPhase(new Date()),
    }),
    state: `briefing=${isSet(briefingAt)}`,
  });
}

function buildReasoningPlanningDomains(input: {
  computing: ComputingFlags;
  syncing: SyncingFlags;
  evidence: ReturnType<typeof readFreshnessEvidence>;
  google: FreshnessQueryData[9];
  briefing: FreshnessQueryData[10];
}): DomainFreshness[] {
  return [
    makeDomainFreshness({
      computing: input.computing,
      domainName: 'reasoning',
      lastUpdatedAt: input.evidence.reasoningAt,
      freshness: resolveReasoningFreshness({
        computingReasoning: input.computing.reasoning === true,
        reasoningAt: input.evidence.reasoningAt,
        recoveryAt: input.evidence.recoveryAt,
        fatigueAt: input.evidence.fatigueAt,
        adaptationAt: input.evidence.adaptationAt,
      }),
      state: `reasoning_computed=${isSet(input.evidence.reasoningAt)}`,
    }),
    buildRecommendationsDomain(input),
    makeDomainFreshness({
      computing: input.computing,
      domainName: 'planning',
      lastUpdatedAt: input.google?.lastSyncAt ?? null,
      freshness: resolvePlanningFreshness(
        input.syncing.google === true,
        input.google?.lastSyncAt ?? null,
      ),
      state: `google_sync=${isOAuthAccountConnected(input.google)}`,
    }),
  ];
}

function buildExtendedDomainFreshnessList(input: {
  computing: ComputingFlags;
  syncing: SyncingFlags;
  evidence: ReturnType<typeof readFreshnessEvidence>;
  google: FreshnessQueryData[9];
  briefing: FreshnessQueryData[10];
}): DomainFreshness[] {
  return [...buildPhysicalEnvironmentDomains(input), ...buildReasoningPlanningDomains(input)];
}

function buildDomainFreshnessList(input: {
  computing: ComputingFlags;
  syncing: SyncingFlags;
  twin: FreshnessQueryData[0];
  latestSleep: FreshnessQueryData[1];
  latestSession: FreshnessQueryData[2];
  latestSubjective: FreshnessQueryData[3];
  latestBody: FreshnessQueryData[4];
  renpho: FreshnessQueryData[7];
  withings: FreshnessQueryData[8];
  google: FreshnessQueryData[9];
  briefing: FreshnessQueryData[10];
  latestSnapshot: FreshnessQueryData[11];
}): DomainFreshness[] {
  const evidence = readFreshnessEvidence(input);
  return [
    ...buildCoreDomainFreshnessList({
      computing: input.computing,
      syncing: input.syncing,
      evidence,
      renpho: input.renpho,
      withings: input.withings,
    }),
    ...buildExtendedDomainFreshnessList({
      computing: input.computing,
      syncing: input.syncing,
      evidence,
      google: input.google,
      briefing: input.briefing,
    }),
  ];
}

export async function computeFreshnessSnapshot(params: {
  athleteId: string;
  trainingDayId: string;
  computing?: ComputingFlags;
  syncing?: SyncingFlags;
}): Promise<AthleteFreshnessSnapshot> {
  const { athleteId, trainingDayId } = params;
  const computing = params.computing ?? {};
  const syncing = params.syncing ?? {};
  const [
    twin,
    latestSleep,
    latestSession,
    latestSubjective,
    latestBody,
    strava,
    garmin,
    renpho,
    withings,
    google,
    briefing,
    latestSnapshot,
  ] = await loadFreshnessQueryData(athleteId, trainingDayId);

  const providers = buildProviderFreshnessList(
    { strava, garmin, renpho, withings, google },
    syncing,
  );
  const domains = buildDomainFreshnessList({
    computing,
    syncing,
    twin,
    latestSleep,
    latestSession,
    latestSubjective,
    latestBody,
    renpho,
    withings,
    google,
    briefing,
    latestSnapshot,
  });
  const productMessages = domains.map((entry) => entry.productMessage);
  const overallFresh = domains.every(
    (entry) => entry.freshness === 'fresh' || entry.freshness === 'unavailable',
  );

  return {
    athleteId,
    trainingDayId,
    computedAt: new Date().toISOString(),
    domains,
    providers,
    overallFresh,
    primaryProductMessage: pickPrimaryProductMessage(productMessages),
  };
}

const PROVIDER_SYNC_MIN_HOUR: Partial<Record<ProviderFreshness['provider'], number>> = {
  renpho: 6,
  withings: 6,
  google: 7,
};

function providerNeedsSyncNow(provider: ProviderFreshness, hour: number): boolean {
  if (!provider.connected || provider.syncing || !provider.stale) {
    return false;
  }
  if (provider.provider === 'garmin' || provider.provider === 'strava') {
    return true;
  }
  const minHour = PROVIDER_SYNC_MIN_HOUR[provider.provider];
  return minHour !== undefined && hour >= minHour;
}

export function providersNeedingSync(
  snapshot: AthleteFreshnessSnapshot,
  options?: { force?: boolean },
): string[] {
  if (options?.force) {
    return snapshot.providers
      .filter((provider) => provider.connected)
      .map((provider) => provider.provider);
  }

  const hour = new Date().getHours();
  return [
    ...new Set(
      snapshot.providers
        .filter((provider) => providerNeedsSyncNow(provider, hour))
        .map((provider) => provider.provider),
    ),
  ];
}

export function trainingDayIdNow(): string {
  return trainingDayIdForNow();
}

export function shouldSyncOnOpen(snapshot: AthleteFreshnessSnapshot): boolean {
  const hour = new Date().getHours();
  if (hour < 5) {
    return false;
  }
  if (!snapshot.overallFresh) {
    return true;
  }
  return snapshot.providers.some((p) => p.connected && p.stale);
}
