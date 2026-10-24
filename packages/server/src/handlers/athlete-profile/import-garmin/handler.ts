import { NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { importGarminThresholds } from '@sharpit/server/lib/integrations/garmin/garmin-sync';

export async function POST() {
  try {
    const athleteId = await getCurrentAthleteId();
    const result = await importGarminThresholds(athleteId);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error && error.message.includes('non connecté')
        ? 'Compte Garmin non connecté'
        : "Impossible d'importer les seuils depuis Garmin";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
