import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectV1Pro } from '@sharpit/server/lib/access/pro-v1';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { AppleOwnershipError, applyAppleTransaction } from '@sharpit/server/lib/billing/apple-sync';
import {
  verifyAppleRenewalInfo,
  verifyAppleTransaction,
} from '@sharpit/server/lib/billing/apple-verifier';
import { appAccountTokenFor, loadProState } from '@sharpit/server/lib/billing/subscription-store';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

const bodySchema = z.object({
  signedTransaction: z.string().min(1).max(20_000),
  signedRenewalInfo: z.string().min(1).max(20_000).optional(),
});

/**
 * After a StoreKit purchase or restore: the app sends the signed transaction, the web
 * verifies it against Apple's certificate chain, stores the subscription and re-derives
 * the tier. The app is never the authority — it re-reads `/api/v1/pro` from the answer.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'signedTransaction est requis' }, { status: 400 });
  }

  let athleteId: string;
  try {
    athleteId = await getCurrentAthleteId();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let verified;
  try {
    verified = {
      transaction: await verifyAppleTransaction(parsed.data.signedTransaction),
      renewal: parsed.data.signedRenewalInfo
        ? await verifyAppleRenewalInfo(parsed.data.signedRenewalInfo)
        : null,
    };
  } catch (error) {
    logSafeError('billing/apple/verify', error, { athleteId });
    return NextResponse.json({ error: 'Transaction Apple invalide' }, { status: 400 });
  }

  try {
    await applyAppleTransaction({
      athleteId,
      athleteAppAccountToken: await appAccountTokenFor(athleteId),
      requireAppAccountToken: true,
      ...verified,
    });
    const { tier, subscription } = await loadProState(athleteId);
    return NextResponse.json(projectV1Pro(tier, subscription));
  } catch (error) {
    if (error instanceof AppleOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logSafeError('billing/apple/verify', error, { athleteId });
    return NextResponse.json({ error: 'Abonnement impossible à enregistrer' }, { status: 500 });
  }
}
