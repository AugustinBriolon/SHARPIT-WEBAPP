import { clerkClient } from '@clerk/nextjs/server';
import { deleteLangfuseTracesForAthlete } from '@sharpit/server/lib/ai/langfuse-erasure';
import { revokeAllProviderAccess } from '@sharpit/server/lib/integrations/provider-revocation';
import { prisma } from '@sharpit/db/client';
import { endGarminRegistration } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { purgeEligibleBefore } from '@sharpit/server/lib/privacy/consent';
import { PRIVACY_PURGE_DELAY_DAYS } from '@sharpit/app/lib/privacy/constants';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';
import {
  reportDeletionFailures,
  type DeletionFailure,
} from '@sharpit/server/lib/privacy/deletion-alert';
import { accountDeletedEmail } from '@sharpit/app/lib/privacy/account-deleted-email';
import type { AccountDeletedEmailInput } from '@sharpit/app/lib/privacy/account-deleted-email';
import { sendTransactionalEmail } from '@sharpit/server/lib/email/transactional-email';
import { forgetCalendarIds } from '@sharpit/server/lib/integrations/google/calendar-ids-cache';

export type AccountDeletionResult = {
  athleteId: string;
  deletedAt: Date;
};

/**
 * Wipe encrypted provider credentials first, so no sync can run on an account being
 * deleted even if a later step fails. Empty strings are not live AES-GCM secrets —
 * connection-status treats the account as disconnected.
 */
export async function clearAthleteProviderCredentials(athleteId: string): Promise<void> {
  // Garmin must hear of it while the token still works (OAuth2 PKCE spec §6).
  await endGarminRegistration(athleteId);
  await prisma.$transaction([
    prisma.garminAccount.updateMany({
      where: { athleteId },
      data: { accessTokenEnc: '', refreshTokenEnc: '' },
    }),
    prisma.stravaAccount.updateMany({
      where: { athleteId },
      data: { accessTokenEnc: '', refreshTokenEnc: '' },
    }),
    prisma.googleAccount.updateMany({
      where: { athleteId },
      data: { accessTokenEnc: '', refreshTokenEnc: '' },
    }),
    prisma.withingsAccount.updateMany({
      where: { athleteId },
      data: { accessTokenEnc: '', refreshTokenEnc: '' },
    }),
    prisma.renphoAccount.updateMany({
      where: { athleteId },
      data: { passwordEnc: '' },
    }),
  ]);
}

type DeletionNotice = AccountDeletedEmailInput & { to: string };

/**
 * Who to tell, and whether a subscription still renews — read before the identity and the
 * rows are gone. Best effort: no address means no e-mail, never a stopped deletion.
 */
async function readDeletionNotice(
  athleteId: string,
  clerkUserId: string,
): Promise<DeletionNotice | null> {
  try {
    const [user, renewing] = await Promise.all([
      (await clerkClient()).users.getUser(clerkUserId),
      prisma.subscription.findFirst({
        where: {
          athleteId,
          willRenew: true,
          status: { in: ['active', 'grace_period', 'billing_retry'] },
        },
        select: { source: true },
      }),
    ]);
    const to = user.primaryEmailAddress?.emailAddress;
    if (!to) {
      return null;
    }
    return { to, firstName: user.firstName, renewingSubscription: renewing?.source ?? null };
  } catch (error) {
    logSafeError('privacy/delete-notice', error, { athleteId });
    return null;
  }
}

/** True once the identity is gone: deleted now, or already absent (404). */
async function deleteClerkIdentity(clerkUserId: string, athleteId: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkUserId);
    return true;
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404) {
      return true;
    }
    logSafeError('privacy/delete-clerk', error, { athleteId });
    return false;
  }
}

/**
 * Coach traces live in Langfuse, outside Postgres. True once they are gone; a failure is
 * logged and returned, never thrown, so the caller decides what it means for the deletion.
 */
async function deleteCoachTraces(athleteId: string): Promise<boolean> {
  try {
    await deleteLangfuseTracesForAthlete(athleteId);
    return true;
  } catch (error) {
    logSafeError('privacy/delete-langfuse', error, { athleteId });
    return false;
  }
}

/** The copies outside Postgres. Both are tried, so one retry can settle both. */
async function eraseExternalCopies(row: {
  id: string;
  clerkUserId: string;
}): Promise<DeletionFailure[]> {
  const identityGone = await deleteClerkIdentity(row.clerkUserId, row.id);
  const tracesGone = await deleteCoachTraces(row.id);
  return [
    ...(identityGone ? [] : [{ athleteId: row.id, step: 'clerk-identity' as const }]),
    ...(tracesGone ? [] : [{ athleteId: row.id, step: 'coach-traces' as const }]),
  ];
}

function failedRevocations(
  athleteId: string,
  outcomes: Awaited<ReturnType<typeof revokeAllProviderAccess>>,
): DeletionFailure[] {
  return Object.entries(outcomes)
    .filter(([, outcome]) => outcome === 'failed')
    .map(([provider]) => ({ athleteId, step: 'provider-revocation' as const, provider }));
}

/**
 * Removes the profile row; every tenant table cascades from it (all 54, checked against
 * the production schema).
 */
export async function hardDeleteAthleteData(athleteId: string): Promise<void> {
  await prisma.athleteProfile.deleteMany({ where: { id: athleteId } });
  // Calendar ids are often e-mail addresses; the cache would otherwise outlive the account by hours.
  await forgetCalendarIds(athleteId);
}

/**
 * Completes a deletion whose identity is signing back in: its data and traces go, the
 * identity stays — it is about to own a fresh profile.
 */
export async function eraseAthleteData(athleteId: string): Promise<void> {
  if (!(await deleteCoachTraces(athleteId))) {
    // The rows go anyway: the identity is about to own a fresh profile, so no later run
    // could find these traces again. The controller is told to remove them by hand.
    await reportDeletionFailures([{ athleteId, step: 'coach-traces' }]);
  }
  await hardDeleteAthleteData(athleteId);
}

/**
 * Soft-deletes an account: marks `deletedAt`, revokes provider grants at Strava / Withings / etc.,
 * clears credentials, and sends the 14-day grace notice e-mail.
 *
 * Full erasure (Clerk identity, Coach traces, database rows) occurs after `PRIVACY_PURGE_DELAY_DAYS`
 * via `/api/cron/privacy-purge`, or can be cancelled if the athlete signs back in during the grace period.
 */
export async function deleteAthleteAccount(
  athleteId: string,
  now = new Date(),
): Promise<AccountDeletionResult> {
  const marked = await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: { deletedAt: now },
    select: { id: true, clerkUserId: true },
  });
  const notice = await readDeletionNotice(athleteId, marked.clerkUserId);
  // Needs the credentials, so before they are wiped. Never throws; a refusal is reported,
  // because once the tokens are gone nothing can retry it.
  const outcomes = await revokeAllProviderAccess(athleteId);
  await reportDeletionFailures(failedRevocations(athleteId, outcomes));
  await clearAthleteProviderCredentials(athleteId);

  // Sent once marked and revoked, informing the user of the 14-day grace period.
  if (notice) {
    await sendTransactionalEmail({ to: notice.to, ...accountDeletedEmail(notice) });
  }
  return { athleteId, deletedAt: now };
}

/**
 * Restores a soft-deleted account within the grace period (sets deletedAt back to null).
 */
export async function restoreAthleteAccount(athleteId: string): Promise<void> {
  await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: { deletedAt: null },
  });
}

export type PurgeResult = { purged: string[]; failed: DeletionFailure[] };

/**
 * Finishes every deletion still pending — accounts marked `deletedAt` whose rows were
 * not removed: identity and traces first, then the rows.
 *
 * The rows are removed only once both outside copies are gone. When one fails, the profile
 * stays (already unusable, credentials wiped) so the next run retries it, and the controller
 * is e-mailed. Removing the rows first would leave the failed copy with nothing to find it by.
 *
 * Hook: GET /api/cron/privacy-purge (Bearer CRON_SECRET), scheduled in vercel.json.
 */
export async function purgeSoftDeletedAthletes(now = new Date()): Promise<PurgeResult> {
  const cutoff = purgeEligibleBefore(now, PRIVACY_PURGE_DELAY_DAYS);
  const due = await prisma.athleteProfile.findMany({
    where: {
      deletedAt: { not: null, lte: cutoff },
    },
    select: { id: true, clerkUserId: true },
  });

  const purged: string[] = [];
  const failed: DeletionFailure[] = [];
  for (const row of due) {
    const failures = await eraseExternalCopies(row);
    if (failures.length > 0) {
      failed.push(...failures);
      continue;
    }
    await hardDeleteAthleteData(row.id);
    purged.push(row.id);
  }
  await reportDeletionFailures(failed);
  return { purged, failed };
}
