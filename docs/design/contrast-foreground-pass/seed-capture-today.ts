/**
 * Local-only seed for contrast-pass Today screenshots.
 *
 * Targets the DEV_BYPASS athlete (`local_fictional_capture`): fictional data on
 * ephemeral Postgres only — never prod / shared Neon.
 *
 * Goal: morning verdict card = Prudence + Comme hier + explanation + instruction
 * + Frein · 2 signaux (hrv_low, sleep_short).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { seedDemoAthlete, DEMO_CLERK_USER_ID } from '@sharpit/server/lib/demo/seed-demo-data';
import { demoAnchorTrainingDayId } from '@sharpit/server/lib/demo/demo-calendar';
import { addTrainingDays } from '@sharpit/core/training/training-day';
import { encryptSecret } from '@sharpit/server/lib/secret-box';

const CAPTURE_CLERK_USER_ID = 'local_fictional_capture';

const prisma = new PrismaClient();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

async function resolveCaptureAthleteId(): Promise<string> {
  const existingCapture = await prisma.athleteProfile.findUnique({
    where: { clerkUserId: CAPTURE_CLERK_USER_ID },
    select: { id: true },
  });
  if (existingCapture) {
    // Temporarily restore the demo sentinel so seedDemoAthlete upserts this row.
    await prisma.athleteProfile.update({
      where: { id: existingCapture.id },
      data: { clerkUserId: DEMO_CLERK_USER_ID },
    });
  }

  await seedDemoAthlete(prisma);

  const demo = await prisma.athleteProfile.findUniqueOrThrow({
    where: { clerkUserId: DEMO_CLERK_USER_ID },
    select: { id: true },
  });

  // DEV_BYPASS_CLERK excludes clerkUserId=demo — rename for local captures.
  await prisma.athleteProfile.update({
    where: { id: demo.id },
    data: {
      clerkUserId: CAPTURE_CLERK_USER_ID,
      sleepTargetMinutes: 480,
      displayMode: 'essential',
    },
  });

  return demo.id;
}

/**
 * Keep Garmin/Renpho/MFP rows (source-prefs need presence for DailyHealth reads)
 * but fill fictional live credentials so reconnectNames stays empty.
 */
async function seedFreshConnectionStubs(athleteId: string): Promise<void> {
  const oauth1 = encryptSecret(
    JSON.stringify({ oauth_token: 'capture-oa1', oauth_token_secret: 'capture-sec' }),
  );
  const oauth2 = encryptSecret(
    JSON.stringify({
      access_token: 'capture-access',
      refresh_token: 'capture-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
    }),
  );
  const passwordEnc = encryptSecret('capture-renpho-password');
  const sessionTokenEnc = encryptSecret('capture-mfp-session');

  await prisma.garminAccount.upsert({
    where: { athleteId },
    create: {
      athleteId,
      oauth1TokenEnc: oauth1,
      oauth2TokenEnc: oauth2,
      displayName: 'Athlète Capture',
    },
    update: { oauth1TokenEnc: oauth1, oauth2TokenEnc: oauth2, displayName: 'Athlète Capture' },
  });
  await prisma.renphoAccount.upsert({
    where: { athleteId },
    create: {
      athleteId,
      email: 'capture@sharpit.local',
      passwordEnc,
      displayName: 'Athlète Capture',
    },
    update: { email: 'capture@sharpit.local', passwordEnc, displayName: 'Athlète Capture' },
  });

  // Drop any other provider rows that would show as expired without tokens.
  await Promise.all([
    prisma.stravaAccount.deleteMany({ where: { athleteId } }),
    prisma.withingsAccount.deleteMany({ where: { athleteId } }),
    prisma.googleAccount.deleteMany({ where: { athleteId } }),
  ]);
}

/** Session-link story completes a run today → SESSION_COMPLETED, empty posture tag. */
async function forceMorningSessionContext(athleteId: string, todayId: string): Promise<void> {
  const dayStart = new Date(`${todayId}T00:00:00.000Z`);
  const dayEnd = new Date(`${todayId}T23:59:59.999Z`);

  await prisma.activity.deleteMany({
    where: { athleteId, date: { gte: dayStart, lte: dayEnd } },
  });
  await prisma.observation.deleteMany({
    where: { athleteId, trainingDayId: todayId, type: 'SESSION' },
  });

  // Keep at most one incomplete planned session later today (PLANNED_ONLY → MORNING).
  const planned = await prisma.plannedSession.findMany({
    where: { athleteId, date: { gte: dayStart, lte: dayEnd } },
    orderBy: { createdAt: 'asc' },
  });
  if (planned.length === 0) {
    await prisma.plannedSession.create({
      data: {
        athleteId,
        date: dayStart,
        title: 'Footing récup — capture',
        type: 'RUN',
        completed: false,
        durationMin: 40,
      },
    });
  } else {
    const [keep, ...rest] = planned;
    if (keep) {
      await prisma.plannedSession.update({
        where: { id: keep.id },
        data: { completed: false, activityId: null },
      });
    }
    if (rest.length > 0) {
      await prisma.plannedSession.deleteMany({
        where: { id: { in: rest.map((row) => row.id) } },
      });
    }
  }
}

async function seedCautionHealth(athleteId: string, todayId: string): Promise<void> {
  const date = new Date(`${todayId}T00:00:00.000Z`);
  const fields = {
    hrv: 52,
    hrvBaselineLow: 68,
    hrvBaselineHigh: 92,
    hrvStatus: 'UNBALANCED_LOW',
    restingHr: 48,
    sleepMinutes: 340,
    sleepScore: 62,
    // Keep restorative ratio ≥ 40% so sleep_poor does not join the frein chip.
    sleepDeepMin: 90,
    sleepLightMin: 150,
    sleepRemMin: 80,
    sleepAwakeMin: 20,
    sleepBedtimeMin: 0,
    sleepWakeMin: 340,
    recoveryScore: 58,
    readinessLevel: 'MODERATE',
    readinessFeedback: 'RECOVERING',
    stress: 3,
    mood: 'Fatigué',
    bodyBattery: 42,
    totalSteps: 4200,
    calories: 2800,
    weightKg: 79.6,
  };
  await prisma.dailyHealth.upsert({
    where: { athleteId_date: { athleteId, date } },
    create: { athleteId, date, ...fields },
    update: fields,
  });
}

async function seedMorningWellness(athleteId: string, todayId: string): Promise<void> {
  const existing = await prisma.observation.findFirst({
    where: {
      athleteId,
      trainingDayId: todayId,
      type: 'SUBJECTIVE',
      source: 'MANUAL',
    },
    select: { id: true, data: true },
  });
  const data = {
    mood: 2,
    energyLevel: 2,
    perceivedSoreness: 5,
    stressLevel: 3,
    notes: 'Capture fictionnelle — fatigue légère au réveil.',
  };
  const now = new Date(`${todayId}T07:15:00.000Z`);
  if (existing && !(existing.data as { sessionExternalId?: unknown })?.sessionExternalId) {
    await prisma.observation.update({
      where: { id: existing.id },
      data: { data, timestamp: now },
    });
    return;
  }
  await prisma.observation.create({
    data: {
      id: randomUUID(),
      athleteId,
      type: 'SUBJECTIVE',
      source: 'MANUAL',
      timestamp: now,
      receivedAt: now,
      trainingDayId: todayId,
      quality: 'HIGH',
      qualityFlags: [],
      normalizedAt: now,
      externalId: `capture-wellness-${todayId}`,
      data,
    },
  });
}

function patchSnapshotForCautionMorning(payload: unknown): Record<string, unknown> {
  const snap = asRecord(payload) ?? {};
  const decision = asRecord(snap.decision) ?? {};
  const recovery = asRecord(snap.recovery) ?? {};
  const recoverySignals = asRecord(recovery.signals) ?? {};
  const dailyPhase = asRecord(snap.dailyPhase) ?? {};
  const dailySignals = asRecord(dailyPhase.signals) ?? {};
  const limitingFactor = asRecord(snap.limitingFactor) ?? {};

  snap.todaysDecision = 'CAUTION';
  decision.overallVerdict = 'CAUTION';
  decision.primaryDecision = {
    ...(asRecord(decision.primaryDecision) ?? {}),
    verdict: 'CAUTION',
  };
  snap.decision = decision;

  recovery.readinessCategory = 'REDUCED';
  recovery.primaryLimitingFactor = 'autonomic';
  recoverySignals.subjectiveWellness = 'NORMAL';
  recoverySignals.loadStressContext = 'NORMAL';
  recovery.signals = recoverySignals;
  snap.recovery = recovery;

  snap.limitingFactor = {
    ...limitingFactor,
    system: 'RECOVERY',
    description: {
      code: 'reasoning.limitingFactor.recovery.deficit',
      params: { limiter: 'autonomic' },
    },
    actionable: true,
  };

  dailyPhase.phase = 'MORNING';
  dailyPhase.phaseLabel = 'Matin';
  dailySignals.resolvedBecause = 'capture_forced_morning';
  dailySignals.completedSessionCount = 0;
  dailySignals.remainingPlannedCount = 1;
  dailySignals.sessionStatus = 'PLANNED_ONLY';
  dailySignals.localHour = 8;
  dailyPhase.signals = dailySignals;
  snap.dailyPhase = dailyPhase;

  // Clear afternoon SESSION_COMPLETED narrative leftovers.
  snap.phaseNarrative = {
    heroHeadline: 'Prudence',
    heroSubline: 'Le corps demande de freiner un cran.',
    heroEyebrow: 'Ce matin',
    postureLabel: 'Prudence',
    posture: 'protect',
  };
  snap.adviceActionable = true;
  snap.generatedAt = new Date().toISOString();
  snap.sessionsDoneToday = [];
  snap.primaryProductMessage = null;
  snap.insufficientDataMessage = null;

  const freshness = asRecord(snap.freshness) ?? {};
  freshness.primaryProductMessage = null;
  freshness.overallFresh = true;
  snap.freshness = freshness;
  snap.domainMessages = {};

  return snap;
}

async function patchTodayAndYesterdaySnapshots(athleteId: string, todayId: string): Promise<void> {
  const yesterdayId = addTrainingDays(todayId, -1);
  const now = new Date();

  const todayRow = await prisma.athleteSnapshotRecord.findUnique({
    where: { athleteId_trainingDayId: { athleteId, trainingDayId: todayId } },
  });
  if (!todayRow) {
    throw new Error(`Missing today snapshot for ${todayId}`);
  }

  const cautionPayload = patchSnapshotForCautionMorning(todayRow.payload);
  await prisma.athleteSnapshotRecord.update({
    where: { id: todayRow.id },
    data: { payload: cautionPayload, generatedAt: now },
  });

  const yesterdayPayload = {
    ...cautionPayload,
    todaysDecision: 'CAUTION',
    decision: {
      ...(asRecord(cautionPayload.decision) ?? {}),
      overallVerdict: 'CAUTION',
      primaryDecision: { verdict: 'CAUTION' },
    },
    dailyPhase: {
      ...(asRecord(cautionPayload.dailyPhase) ?? {}),
      phase: 'END_OF_DAY',
      signals: {
        ...((asRecord(asRecord(cautionPayload.dailyPhase)?.signals) as Record<string, unknown>) ??
          {}),
        localHour: 21,
        completedSessionCount: 1,
        remainingPlannedCount: 0,
        sessionStatus: 'COMPLETED_ONLY',
      },
    },
  };

  await prisma.athleteSnapshotRecord.upsert({
    where: { athleteId_trainingDayId: { athleteId, trainingDayId: yesterdayId } },
    create: {
      athleteId,
      trainingDayId: yesterdayId,
      snapshotId: `capture-yesterday-${yesterdayId}`,
      payload: yesterdayPayload,
      generatedAt: now,
    },
    update: { payload: yesterdayPayload, generatedAt: now },
  });
}

async function main(): Promise<void> {
  const todayId = demoAnchorTrainingDayId();
  console.log('capture seed — training day', todayId);

  const athleteId = await resolveCaptureAthleteId();
  console.log('athlete', athleteId, CAPTURE_CLERK_USER_ID);

  await seedFreshConnectionStubs(athleteId);
  await forceMorningSessionContext(athleteId, todayId);
  await seedCautionHealth(athleteId, todayId);
  await seedMorningWellness(athleteId, todayId);
  await patchTodayAndYesterdaySnapshots(athleteId, todayId);

  console.log('done — Prudence / Comme hier / hrv_low+sleep_short ready');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
