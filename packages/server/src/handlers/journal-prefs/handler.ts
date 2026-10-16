import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { hasProAccess } from '@sharpit/app/lib/access/tier';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  defaultJournalPrefs,
  parseJournalPrefs,
  sanitizeJournalPrefsForPersist,
} from '@sharpit/app/lib/journal/journal-prefs';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';
import { prisma } from '@sharpit/db/client';
import {
  journalPrefsPutBodySchema,
  journalPrefsWriteErrorCode,
} from '@sharpit/server/lib/validators/journal-prefs';

export async function GET() {
  // Outside try: Cache Components prerender interrupt must not be swallowed.
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const profile = await prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: { journalPrefs: true, tier: true },
    });
    const isPro = hasProAccess(profile?.tier ?? 'FREE');
    const prefs = profile?.journalPrefs
      ? parseJournalPrefs(profile.journalPrefs)
      : defaultJournalPrefs();
    return NextResponse.json({ prefs, isPro });
  } catch (error) {
    console.error('[journal-prefs]', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json(
      { error: 'Impossible de charger les préférences journal' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const profile = await prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: { tier: true },
    });
    const isPro = hasProAccess(profile?.tier ?? 'FREE');
    const body = await request.json();
    const parsed = journalPrefsPutBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Préférences journal invalides',
          code: journalPrefsWriteErrorCode(parsed.error),
        },
        { status: 400 },
      );
    }
    const prefs = sanitizeJournalPrefsForPersist(parsed.data.prefs, isPro);
    await prisma.athleteProfile.update({
      where: { id: athleteId },
      data: { journalPrefs: prefs as Prisma.InputJsonValue },
    });
    return NextResponse.json({ prefs, isPro });
  } catch (error) {
    console.error('[journal-prefs]', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json(
      { error: 'Impossible d’enregistrer les préférences journal' },
      { status: 500 },
    );
  }
}
