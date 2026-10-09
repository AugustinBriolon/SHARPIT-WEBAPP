import { sendPushToDevices } from '@sharpit/server/lib/push/athlete-push';
import { appOrigin } from '@sharpit/server/lib/app-origin';
import { mapWithConcurrency } from '@sharpit/server/lib/async/map-with-concurrency';
import { trainingDayIdNow } from '@sharpit/server/lib/athlete-state/freshness-service';
import { refreshAthleteState } from '@sharpit/server/lib/athlete-state/orchestrator';
import { getLatestAthleteSnapshot } from '@sharpit/server/infrastructure/athlete-state/snapshot-repository';
import { prisma } from '@sharpit/db/client';
import { wantsMorningVerdict } from '@sharpit/server/lib/notifications/notification-prefs';
import type { ApnsPayload } from '@sharpit/server/lib/push/apns';
import {
  mapVerdictToDisplay,
  type OverallVerdict,
} from '@sharpit/app/lib/today/dashboard/today-mapping';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import {
  ensureMorningRecalibration,
  type MorningRecalibrationPresentation,
} from '@sharpit/server/lib/morning-recalibration/service';

export type MorningPushPayload = {
  title: string;
  body: string;
  url: string;
  verdict: OverallVerdict | null;
  trainingDayId: string;
};

export type MorningPushAthleteResult = {
  athleteId: string;
  sent: number;
  failed: number;
  deactivated: number;
  skippedReason?:
    'DEACTIVATED' | 'OPTED_OUT' | 'NO_DEVICE_TOKENS' | 'ALREADY_SENT_TODAY' | 'NO_SNAPSHOT';
  verdict?: OverallVerdict | null;
};

export type MorningPushSummary = {
  totalAthletes: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  deactivatedTokens: number;
  results: MorningPushAthleteResult[];
};

const DEFAULT_CONCURRENCY = 5;

/**
 * Builds the minimal, silenceable morning push notification payload (Moment 1 - Wake).
 * Meets the athlete with a single honest verdict + briefing excerpt before they open the app.
 */
export function buildMorningPushPayload(
  snapshot: AthleteSnapshot,
  origin = appOrigin('https://sharpit.app'),
  proposal: MorningRecalibrationPresentation | null = null,
): MorningPushPayload {
  const verdict = (snapshot.todaysDecision ??
    snapshot.decision?.overallVerdict ??
    null) as OverallVerdict | null;

  let title = 'Verdict du jour';
  if (verdict) {
    const display = mapVerdictToDisplay(verdict);
    title = display?.label ?? title;
  }

  // The night's proposal for today's session first — the one thing to act on — else the briefing.
  const rawBody =
    morningProposalLine(proposal) ||
    snapshot.primaryProductMessage ||
    snapshot.briefing?.content?.split('\n').find((l) => l.trim().length > 0) ||
    snapshot.insufficientDataMessage ||
    'Ta lecture du jour t’attend dans SharpIt.';

  // Cap length cleanly for lock screen presentation
  const body = rawBody.length > 140 ? `${rawBody.slice(0, 137).trim()}…` : rawBody;
  const url = `${origin.replace(/\/+$/, '')}/today`;

  return {
    title,
    body,
    url,
    verdict,
    trainingDayId: snapshot.trainingDayId,
  };
}

/** « Ta nuit invite à lever le pied : Endurance → Récupération · 40 → 30 min », while it waits. */
export function morningProposalLine(
  proposal: MorningRecalibrationPresentation | null,
): string | null {
  if (!proposal || proposal.status !== 'PRESENTED') {
    return null;
  }
  const lead =
    proposal.direction === 'DOWN'
      ? 'Ta nuit invite à lever le pied'
      : 'Tu as bien récupéré, on peut monter d’un cran';
  return `${lead} : ${proposal.changeSummary}`;
}

export function toApnsPayload(morning: MorningPushPayload): ApnsPayload {
  return {
    aps: {
      alert: {
        title: morning.title,
        body: morning.body,
      },
      sound: 'default',
      badge: 1,
      'thread-id': 'morning-verdict',
      category: 'MORNING_VERDICT',
    },
    url: morning.url,
    trainingDayId: morning.trainingDayId,
    verdict: morning.verdict,
  };
}

type MorningPushSkipReason = NonNullable<MorningPushAthleteResult['skippedReason']>;

/**
 * Why this athlete gets no morning push today, if they don't. `force` (the test push)
 * is the athlete asking for one: it overrides the opt-out and the once-a-day rule.
 */
function morningPushSkipReason(
  athlete: {
    deletedAt: Date | null;
    lastMorningPushDate: string | null;
    notificationPrefs: unknown;
    deviceTokens: unknown[];
  } | null,
  dayId: string,
  force: boolean,
): MorningPushSkipReason | undefined {
  if (!athlete || athlete.deletedAt) {
    return 'DEACTIVATED';
  }
  // Paramètres → Notifications.
  if (!force && !wantsMorningVerdict(athlete.notificationPrefs)) {
    return 'OPTED_OUT';
  }
  if (!force && athlete.lastMorningPushDate === dayId) {
    return 'ALREADY_SENT_TODAY';
  }
  return athlete.deviceTokens.length === 0 ? 'NO_DEVICE_TOKENS' : undefined;
}

/**
 * Claims today's morning-push slot so `after()` and the cron cannot both send.
 * Returns false when another caller already claimed (or finished) this day.
 * `force` (test push) skips the claim — the athlete asked for another one.
 */
async function claimMorningPushDay(
  athleteId: string,
  dayId: string,
  force: boolean,
): Promise<boolean> {
  if (force) {
    return true;
  }
  const claimed = await prisma.athleteProfile.updateMany({
    where: {
      id: athleteId,
      deletedAt: null,
      NOT: { lastMorningPushDate: dayId },
    },
    data: { lastMorningPushDate: dayId },
  });
  return claimed.count === 1;
}

/** Releases a claim after a total send failure so the late cron can retry. */
async function releaseMorningPushDayClaim(athleteId: string, dayId: string): Promise<void> {
  try {
    await prisma.athleteProfile.updateMany({
      where: { id: athleteId, lastMorningPushDate: dayId },
      data: { lastMorningPushDate: null },
    });
  } catch (error) {
    console.error('[morning-push] release claim', athleteId, dayId, error);
  }
}

/**
 * Sends the morning push notification to all active devices of an athlete.
 * By default, idempotent per day (skips if already sent today, unless force=true).
 */
export async function sendMorningPushForAthlete(
  athleteId: string,
  options?: {
    force?: boolean;
    trainingDayId?: string;
    origin?: string;
  },
): Promise<MorningPushAthleteResult> {
  const dayId = options?.trainingDayId ?? trainingDayIdNow();
  const force = options?.force ?? false;

  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: {
      id: true,
      deletedAt: true,
      lastMorningPushDate: true,
      notificationPrefs: true,
      deviceTokens: {
        where: { enabled: true },
        select: { id: true, token: true, bundleId: true, environment: true },
      },
    },
  });

  const skippedReason = morningPushSkipReason(athlete, dayId, force);
  if (skippedReason || !athlete) {
    return { athleteId, sent: 0, failed: 0, deactivated: 0, skippedReason };
  }

  // Claim before building/sending so a concurrent after()+cron cannot both deliver.
  if (!(await claimMorningPushDay(athleteId, dayId, force))) {
    return {
      athleteId,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: 'ALREADY_SENT_TODAY',
    };
  }

  // Read or compute today's snapshot
  let snapshot = await getLatestAthleteSnapshot({ athleteId, trainingDayId: dayId });
  if (!snapshot) {
    try {
      const refreshed = await refreshAthleteState(athleteId, {
        trainingDayId: dayId,
        source: 'cron',
        skipSync: true,
      });
      snapshot = refreshed.athleteSnapshot;
    } catch (error) {
      console.error('[morning-push] snapshot refresh', athleteId, error);
    }
  }

  if (!snapshot) {
    if (!force) {
      await releaseMorningPushDayClaim(athleteId, dayId);
    }
    return {
      athleteId,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: 'NO_SNAPSHOT',
    };
  }

  const proposal = await ensureMorningRecalibration(athleteId, dayId, { athleteSnapshot: snapshot })
    .then((result) => result.presentation)
    .catch((error) => {
      console.error('[morning-push] proposal', athleteId, error);
      return null;
    });
  const morningPayload = buildMorningPushPayload(snapshot, options?.origin, proposal);
  const apnsPayload = toApnsPayload(morningPayload);

  const { sent, failed, deactivated } = await sendPushToDevices(athlete.deviceTokens, apnsPayload);

  if (sent === 0 && !force) {
    // Nothing reached a device — free the day so the late cron can try again.
    await releaseMorningPushDayClaim(athleteId, dayId);
  } else if (sent > 0 && force) {
    // Test pushes still stamp the day so the real morning slot stays quiet after a manual send.
    try {
      await prisma.athleteProfile.update({
        where: { id: athleteId },
        data: { lastMorningPushDate: dayId },
      });
    } catch (error) {
      console.error('[morning-push] stamp lastMorningPushDate', athleteId, dayId, error);
    }
  }

  return {
    athleteId,
    sent,
    failed,
    deactivated,
    verdict: morningPayload.verdict,
  };
}

/**
 * Last night reached the server — a sync, an Apple Health upload: today's morning push goes out
 * now rather than at a fixed hour, once a day (`sendMorningPushForAthlete` skips a day already
 * sent). Nothing for a day back-filled later, or before the night's sleep is in.
 */
export async function sendMorningPushOnceNightIsRead(
  athleteId: string,
  trainingDayId: string = trainingDayIdNow(),
): Promise<MorningPushAthleteResult | null> {
  // Before 5 a.m. a night still being written could pass for a whole one (same rule as the
  // sync on open, `shouldSyncOnOpen`).
  if (trainingDayId !== trainingDayIdNow() || new Date().getHours() < 5) {
    return null;
  }
  const night = await prisma.dailyHealth.findUnique({
    where: { athleteId_date: { athleteId, date: new Date(`${trainingDayId}T00:00:00.000Z`) } },
    select: { sleepMinutes: true },
  });
  if (!night?.sleepMinutes) {
    return null;
  }
  return sendMorningPushForAthlete(athleteId, { trainingDayId });
}

/**
 * Sends the morning verdict notification to all eligible athletes.
 * The late fallback (cron): athletes whose night never reached the server still get the day's
 * verdict; the others had it as soon as their night was read (`sendMorningPushOnceNightIsRead`).
 */
export async function sendMorningVerdictPushes(options?: {
  trainingDayId?: string;
  origin?: string;
  concurrency?: number;
}): Promise<MorningPushSummary> {
  const dayId = options?.trainingDayId ?? trainingDayIdNow();

  // Find all active athletes who have at least one enabled device token
  // and haven't yet received today's morning push.
  const athletes = await prisma.athleteProfile.findMany({
    where: {
      deletedAt: null,
      NOT: { lastMorningPushDate: dayId },
      deviceTokens: {
        some: { enabled: true },
      },
    },
    select: { id: true },
  });

  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  const results = await mapWithConcurrency(athletes, concurrency, (athlete) =>
    sendMorningPushForAthlete(athlete.id, {
      trainingDayId: dayId,
      origin: options?.origin,
    }),
  );

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let deactivatedTokens = 0;

  for (const res of results) {
    if (res.skippedReason) {
      skippedCount += 1;
    } else {
      if (res.sent > 0) {
        sentCount += 1;
      }
      if (res.failed > 0 && res.sent === 0) {
        failedCount += 1;
      }
    }
    deactivatedTokens += res.deactivated;
  }

  return {
    totalAthletes: athletes.length,
    sentCount,
    skippedCount,
    failedCount,
    deactivatedTokens,
    results,
  };
}
