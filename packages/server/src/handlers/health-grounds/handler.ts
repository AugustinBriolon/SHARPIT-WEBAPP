import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { getHealthGrounds, replaceHealthGrounds } from '@sharpit/server/lib/queries/health-grounds';
import { putHealthGroundsSchema } from '@sharpit/server/lib/validators/health-ground';

export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    return NextResponse.json(await getHealthGrounds(athleteId));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de charger les terrains' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const parsed = putHealthGroundsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(await replaceHealthGrounds(athleteId, parsed.data));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible d’enregistrer les terrains' }, { status: 500 });
  }
}
