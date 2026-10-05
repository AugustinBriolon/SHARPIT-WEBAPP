import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  getDayJournalEntry,
  upsertDayJournalEntryDb,
} from '@sharpit/server/lib/journal/day-journal-service';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';
import { prisma } from '@sharpit/db/client';

const TRAINING_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Built-in ids (`late_meal`) and custom ones (`custom_1a2b3c4d5e6f`). */
const FACTOR_ID = /^[a-z0-9_]{1,64}$/;

const factorStateSchema = z.enum(['unset', 'no', 'yes']);

const putSchema = z.object({
  trainingDayId: z.string().regex(TRAINING_DAY),
  factors: z
    .record(z.string().regex(FACTOR_ID), factorStateSchema)
    .refine((factors) => Object.keys(factors).length <= 200, 'Trop de signaux')
    .optional(),
  moodLabel: z.string().max(64).nullable().optional(),
  hydrationMl: z.number().int().min(0).max(20_000).nullable().optional(),
  caffeineMg: z.number().int().min(0).max(5_000).nullable().optional(),
  drivingMinutes: z.number().int().min(0).max(1_440).nullable().optional(),
});

/** Field paths only: a journal value is health data and never goes back in an error or a log. */
function invalidFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.') || 'body'))];
}

function logFailure(action: string, error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  console.error(
    `[day-journal] ${action} failed`,
    error instanceof Error ? error.name : 'unknown',
    code,
  );
}

async function readJson(
  request: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

export async function GET(request: NextRequest) {
  // Outside try: Cache Components prerender interrupt must not be swallowed.
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const trainingDayId = request.nextUrl.searchParams.get('day');
    if (!trainingDayId || !TRAINING_DAY.test(trainingDayId)) {
      return NextResponse.json({ error: 'Paramètre day requis (YYYY-MM-DD)' }, { status: 400 });
    }
    const entry = await getDayJournalEntry(prisma, athleteId, trainingDayId);
    return NextResponse.json({ entry });
  } catch (error) {
    logFailure('read', error);
    return NextResponse.json({ error: 'Impossible de charger le journal' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const limit = await checkRateLimit(rateLimiters.dayJournal, athleteId);
    if (!limit.ok) {
      const limited = rateLimitJsonResponse(limit);
      return NextResponse.json(limited.body, {
        status: limited.status,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }

    const json = await readJson(request);
    if (!json.ok) {
      return NextResponse.json({ error: 'Corps de requête JSON invalide' }, { status: 400 });
    }
    const parsed = putSchema.safeParse(json.body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Journal invalide', fields: invalidFields(parsed.error) },
        { status: 422 },
      );
    }
    const entry = await upsertDayJournalEntryDb(prisma, athleteId, parsed.data);
    return NextResponse.json({ entry });
  } catch (error) {
    logFailure('write', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer le journal' }, { status: 500 });
  }
}
