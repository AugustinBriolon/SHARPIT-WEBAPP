import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { athleteHasHealthDataConsent } from '@sharpit/server/lib/privacy/consent-store';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';
import { createBloodTest, listBloodTests } from '@sharpit/server/lib/queries/blood-tests';
import { postBloodTestSchema } from '@sharpit/server/lib/validators/blood-test';

export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    return NextResponse.json({ bloodTests: await listBloodTests(athleteId) });
  } catch (error) {
    logSafeError('blood-tests/list', error);
    return NextResponse.json({ error: 'Impossible de charger les analyses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    if (!(await athleteHasHealthDataConsent(athleteId))) {
      return NextResponse.json({ error: 'Consentement santé requis' }, { status: 403 });
    }
    const parsed = postBloodTestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(await createBloodTest(athleteId, parsed.data), { status: 201 });
  } catch (error) {
    logSafeError('blood-tests/create', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer l’analyse' }, { status: 500 });
  }
}
