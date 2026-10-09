import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';
import { deleteAthleteAccount } from '@sharpit/server/lib/privacy/account-deletion';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

/** Exact string the client must send — typed confirmation, not a silent POST. */
export const PRIVACY_DELETE_CONFIRMATION = 'SUPPRIMER';

const bodySchema = z.object({
  confirmation: z.literal(PRIVACY_DELETE_CONFIRMATION),
});

/** Deletes the account now — data and sign-in identity. The client signs out next. */
export async function POST(request: NextRequest) {
  await awaitRequest();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Confirmation requise : envoie { "confirmation": "${PRIVACY_DELETE_CONFIRMATION}" }`,
      },
      { status: 400 },
    );
  }

  try {
    const athleteId = await getCurrentAthleteId();
    const result = await deleteAthleteAccount(athleteId);
    return NextResponse.json({
      ok: true,
      deletedAt: result.deletedAt.toISOString(),
      message: 'Compte supprimé définitivement.',
    });
  } catch (error) {
    logSafeError('privacy/delete POST', error);
    return NextResponse.json({ error: 'Impossible de supprimer le compte' }, { status: 500 });
  }
}
