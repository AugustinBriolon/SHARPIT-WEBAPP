import { NextRequest, NextResponse, after } from 'next/server';
import { sendMorningPushOnceNightIsRead } from '@sharpit/server/lib/push/morning-push';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { refreshAthleteState } from '@sharpit/server/lib/athlete-state/orchestrator';
import {
  appleHealthPatch,
  appleHealthPolicy,
  type AppleHealthPolicy,
} from '@sharpit/server/lib/integrations/apple-health/apple-health-merge';
import { linkAppleHealth } from '@sharpit/server/lib/integrations/apple-health/apple-health-link';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import { prisma } from '@sharpit/db/client';
import type { DailyHealth } from '@prisma/client';
import { ingestDailyHealthObservations } from '@sharpit/server/lib/integrations/shared/health-observation-backfill';
import { athleteHasHealthDataConsent } from '@sharpit/server/lib/privacy/consent-store';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';

const minutes = z.number().int().min(0).max(1_440).nullish();

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepMinutes: minutes,
  sleepDeepMin: minutes,
  sleepRemMin: minutes,
  sleepLightMin: minutes,
  sleepAwakeMin: minutes,
  sleepBedtimeMin: z.number().int().min(0).max(1_439).nullish(),
  sleepWakeMin: z.number().int().min(0).max(1_439).nullish(),
  restingHr: z.number().int().min(20).max(250).nullish(),
  hrv: z.number().int().min(1).max(500).nullish(),
  totalSteps: z.number().int().min(0).max(200_000).nullish(),
  calories: z.number().int().min(0).max(20_000).nullish(),
  weightKg: z.number().min(20).max(400).nullish(),
});

const bodySchema = z.object({
  source: z.literal('apple-health'),
  days: z.array(daySchema).max(31),
});

/** The day row as stored — DailyHealth dates are UTC midnights of the calendar day. */
function dayKey(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Writes each day's patch; returns the rows that changed. */
async function applyAppleHealthDays(
  athleteId: string,
  days: z.infer<typeof daySchema>[],
  policy: AppleHealthPolicy,
): Promise<DailyHealth[]> {
  if (days.length === 0) {
    return [];
  }

  const dates = days.map((day) => dayKey(day.date));
  return prisma.$transaction(async (tx) => {
    const existingRows = await tx.dailyHealth.findMany({
      where: { athleteId, date: { in: dates } },
    });
    const existingByDay = new Map(
      existingRows.map((row) => [row.date.toISOString().slice(0, 10), row]),
    );

    const updated: DailyHealth[] = [];
    for (const day of days) {
      const date = dayKey(day.date);
      const existing = existingByDay.get(day.date) ?? null;
      const patch = appleHealthPatch(existing, day, policy);
      if (Object.keys(patch).length === 0) {
        continue;
      }
      const row = await tx.dailyHealth.upsert({
        where: { athleteId_date: { athleteId, date } },
        create: { athleteId, date, ...patch },
        update: patch,
      });
      updated.push(row);
    }
    return updated;
  });
}

/**
 * Receives Apple Health day summaries from the native app. What it writes follows the
 * athlete's sources per class: nothing where it is off, the gaps beside a primary source, the
 * whole day where it is the primary (ADR-043, ADR-054).
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données Apple Santé invalides' }, { status: 400 });
  }

  try {
    const athleteId = await getCurrentAthleteId();
    if (!(await athleteHasHealthDataConsent(athleteId))) {
      return NextResponse.json({ error: 'Consentement santé requis' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(rateLimiters.appleHealth, `${athleteId}:days`);
    if (!rateLimit.ok) {
      const limited = rateLimitJsonResponse(rateLimit);
      return NextResponse.json(limited.body, { status: limited.status });
    }

    // Sending is linking: an app that sends before it ever said so is linked here.
    await linkAppleHealth(athleteId, true);
    const policy = appleHealthPolicy(await loadResolvedSourcePrefs(athleteId));
    const updatedRows = await applyAppleHealthDays(athleteId, parsed.data.days, policy);
    const updatedDays = updatedRows.length;

    if (updatedDays > 0) {
      // The Core reads observations, not day rows: without this an athlete on Apple Health
      // alone would never get a readiness. Fail the request if ingest fails so the client
      // retries — day upserts are idempotent. Refresh stays soft: a snapshot miss is not
      // worth rolling back a successful write.
      await ingestDailyHealthObservations(athleteId, updatedRows, 'APPLE_HEALTH');
      await refreshAthleteState(athleteId, { source: 'today_refresh' }).catch((error) => {
        console.error('[api/v1/health-samples] refresh', error);
      });
      // The night may have just arrived — often in the background, as the watch writes it.
      after(() =>
        sendMorningPushOnceNightIsRead(athleteId).catch((error) =>
          console.error('[api/v1/health-samples] morning push', error),
        ),
      );
    }
    return NextResponse.json({ apiVersion: 1, updatedDays });
  } catch (error) {
    console.error('[api/v1/health-samples]', error);
    return NextResponse.json({ error: 'Envoi Apple Santé impossible' }, { status: 500 });
  }
}
