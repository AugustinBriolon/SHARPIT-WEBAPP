import { NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';
import { buildAthleteExportJson } from '@sharpit/server/lib/privacy/export';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

/** GDPR access/portability — athlete-scoped JSON, no raw credentials. */
export async function GET() {
  // Outside try: Cache Components prerender interrupt must not be swallowed.
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const payload = await buildAthleteExportJson(athleteId);
    // Streamed: a full history exceeds the size a buffered function response may have.
    return new NextResponse(new Blob([JSON.stringify(payload)]).stream(), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sharpit-export-${athleteId}.json"`,
      },
    });
  } catch (error) {
    logSafeError('privacy/export GET', error);
    return NextResponse.json({ error: "Impossible d'exporter les données" }, { status: 500 });
  }
}
