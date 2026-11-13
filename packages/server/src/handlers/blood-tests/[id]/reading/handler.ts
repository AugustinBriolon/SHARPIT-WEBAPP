import { NextRequest, NextResponse } from 'next/server';
import { athleteReading } from '@sharpit/app/lib/blood-markers/athlete-reading';
import { requirePro } from '@sharpit/server/lib/access/require-pro';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';
import { getBloodTest } from '@sharpit/server/lib/queries/blood-tests';
import { trainingBeforeSample } from '@sharpit/server/lib/queries/training-before-sample';

type RouteContext = { params: Promise<{ id: string }> };

/** The athlete reading of one test (ADR-129): Pro, deterministic, no model involved. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const proBlocked = await requirePro(athleteId);
    if (proBlocked) {
      return proBlocked;
    }
    const test = await getBloodTest(athleteId, id);
    if (!test) {
      return NextResponse.json({ error: 'Analyse introuvable' }, { status: 404 });
    }
    const training = await trainingBeforeSample(athleteId, new Date(test.sampledAt));
    return NextResponse.json({ training, findings: athleteReading(test.results, training) });
  } catch (error) {
    logSafeError('blood-tests/reading', error);
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 });
  }
}
