import { NextResponse } from 'next/server';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';
import { projectSensitiveZones } from '@sharpit/app/lib/physical-health/sensitive-zones-v1';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { loadSensitiveZoneInputs } from '@sharpit/server/lib/physical-health/sensitive-zones-data';

/**
 * Zones sensibles for the native app (ADR-068): each declared zone with what it does to the
 * plan, its timeline, the follow-up owed and whether closing it is worth proposing.
 */
export async function GET() {
  // Outside try: the Cache Components prerender interrupt must not be swallowed.
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const now = new Date();
    const inputs = await loadSensitiveZoneInputs(athleteId, now);
    return NextResponse.json(projectSensitiveZones({ ...inputs, now }));
  } catch (error) {
    console.error('[api/v1/sensitive-zones]', error);
    return NextResponse.json(
      { error: 'Impossible de charger tes zones sensibles' },
      { status: 500 },
    );
  }
}
