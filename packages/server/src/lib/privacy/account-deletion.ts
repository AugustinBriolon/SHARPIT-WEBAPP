import { clerkClient } from '@clerk/nextjs/server';
import { deleteLangfuseTracesForAthlete } from '@sharpit/server/lib/ai/langfuse-erasure';
import { revokeAllProviderAccess } from '@sharpit/server/lib/integrations/provider-revocation';
import { prisma } from '@sharpit/db/client';
import { purgeEligibleBefore } from '@sharpit/server/lib/privacy/consent';
import { PRIVACY_PURGE_DELAY_DAYS } from '@sharpit/app/lib/privacy/constants';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';
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
  await prisma.$transaction([
    prisma.garminAccount.updateMany({
      where: { athleteId },
      data: { oauth1TokenEnc: '', oauth2TokenEnc: '' },
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

async function deleteClerkIdentity(clerkUserId: string, athleteId: string): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkUserId);
  } catch (error) {
    // Already gone, or Clerk unreachable: the data deletion goes on regardless.
    logSafeError('privacy/delete-clerk', error, { athleteId });
  }
}

/**
 * Coach traces live in Langfuse, outside Postgres. Best effort: a Langfuse outage must
 * not stop the account deletion.
 */
async function deleteCoachTraces(athleteId: string): Promise<void> {
  try {
    await deleteLangfuseTracesForAthlete(athleteId);
  } catch (error) {
    logSafeError('privacy/delete-langfuse', error, { athleteId });
  }
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
  await deleteCoachTraces(athleteId);
  await hardDeleteAthleteData(athleteId);
}

/**
 * Deletes an account now and for good: data, Coach traces and Clerk identity. Signing in again means
 * signing up, from zero.
 *
 * Ordered so a failure midway still leaves the account unusable: `deletedAt` blocks the
 * profile, provider grants are revoked at Strava / Google / Withings, credentials are
 * wiped, the identity (and its sessions) goes, then the rows.
 * If the last step fails, `/api/cron/privacy-purge` finishes it on its next run.
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
  // Needs the credentials, so before they are wiped. Never throws.
  await revokeAllProviderAccess(athleteId);
  await clearAthleteProviderCredentials(athleteId);
  await deleteClerkIdentity(marked.clerkUserId, athleteId);
  await deleteCoachTraces(athleteId);
  await hardDeleteAthleteData(athleteId);
  // Sent once everything is gone, so it confirms what happened rather than announces it.
  if (notice) {
    await sendTransactionalEmail({ to: notice.to, ...accountDeletedEmail(notice) });
  }
  return { athleteId, deletedAt: now };
}

/**
 * Finishes every deletion still pending — accounts marked `deletedAt` whose rows were
 * not removed, including those left by the former 30-day soft-delete: identity first,
 * then the rows. `PRIVACY_PURGE_DELAY_DAYS` is 0, so nothing waits anymore.
 *
 * Hook: GET /api/cron/privacy-purge (Bearer CRON_SECRET), scheduled in vercel.json.
 */
export async function purgeSoftDeletedAthletes(now = new Date()): Promise<{ purged: string[] }> {
  const cutoff = purgeEligibleBefore(now, PRIVACY_PURGE_DELAY_DAYS);
  const due = await prisma.athleteProfile.findMany({
    where: {
      deletedAt: { not: null, lte: cutoff },
    },
    select: { id: true, clerkUserId: true },
  });

  const purged: string[] = [];
  for (const row of due) {
    await deleteClerkIdentity(row.clerkUserId, row.id);
    await deleteCoachTraces(row.id);
    await hardDeleteAthleteData(row.id);
    purged.push(row.id);
  }
  return { purged };
}
