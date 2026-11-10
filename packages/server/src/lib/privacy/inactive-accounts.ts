import { clerkClient } from '@clerk/nextjs/server';
import { prisma } from '@sharpit/db/client';
import { addDays, subMonths } from 'date-fns';
import {
  INACTIVE_ACCOUNT_MONTHS,
  INACTIVE_ACCOUNT_NOTICE_DAYS,
} from '@sharpit/app/lib/privacy/constants';
import { inactivityNoticeEmail } from '@sharpit/app/lib/privacy/inactivity-notice-email';
import { DEMO_CLERK_USER_ID } from '@sharpit/app/lib/demo/demo-session';
import { sendTransactionalEmail } from '@sharpit/server/lib/email/transactional-email';
import { deleteAthleteAccount } from '@sharpit/server/lib/privacy/account-deletion';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

export type InactivityStep = 'none' | 'notify' | 'clear' | 'delete';

/**
 * What an account's inactivity calls for today. The notice goes out 30 days before the
 * 24-month mark; a sign-in after the notice cancels it; silence for 30 days deletes.
 */
export function inactivityStep(input: {
  lastActiveAt: Date;
  noticeSentAt: Date | null;
  now: Date;
}): InactivityStep {
  const { lastActiveAt, noticeSentAt, now } = input;
  if (noticeSentAt) {
    if (lastActiveAt > noticeSentAt) {
      return 'clear';
    }
    return now >= addDays(noticeSentAt, INACTIVE_ACCOUNT_NOTICE_DAYS) ? 'delete' : 'none';
  }
  const noticeDue = addDays(subMonths(now, INACTIVE_ACCOUNT_MONTHS), INACTIVE_ACCOUNT_NOTICE_DAYS);
  return lastActiveAt <= noticeDue ? 'notify' : 'none';
}

type Candidate = {
  id: string;
  clerkUserId: string;
  createdAt: Date;
  inactivityNoticeSentAt: Date | null;
};

type Identity = { lastActiveAt: Date; email: string | null; firstName: string | null };

/** Last sign of life and where to write, from Clerk. Null when Clerk cannot say: no guess is made. */
async function readIdentity(candidate: Candidate): Promise<Identity | null> {
  try {
    const user = await (await clerkClient()).users.getUser(candidate.clerkUserId);
    const lastSeenMs = Math.max(user.lastActiveAt ?? 0, user.lastSignInAt ?? 0);
    return {
      lastActiveAt: lastSeenMs > 0 ? new Date(lastSeenMs) : candidate.createdAt,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      firstName: user.firstName,
    };
  } catch (error) {
    logSafeError('privacy/inactive-identity', error, { athleteId: candidate.id });
    return null;
  }
}

/** The notice is recorded only once the e-mail is accepted: no deletion without a warning. */
async function sendNotice(candidate: Candidate, identity: Identity, now: Date): Promise<boolean> {
  if (!identity.email) {
    return false;
  }
  const sent = await sendTransactionalEmail({
    to: identity.email,
    ...inactivityNoticeEmail({ firstName: identity.firstName }),
  });
  if (sent) {
    await prisma.athleteProfile.update({
      where: { id: candidate.id },
      data: { inactivityNoticeSentAt: now },
    });
  }
  return sent;
}

/**
 * Warns then deletes accounts nobody signed in to for 24 months. A renewing subscription is
 * a contract in force: those accounts are left alone. Deletion is the athlete's own path
 * (`deleteAthleteAccount`), so the 14-day grace period still applies.
 *
 * Hook: GET /api/cron/privacy-purge.
 */
export async function processInactiveAccounts(
  now = new Date(),
): Promise<{ notified: string[]; deleted: string[] }> {
  // shortcut: one Clerk read per account per day; batch with getUserList past a few hundred accounts.
  const candidates = await prisma.athleteProfile.findMany({
    where: {
      deletedAt: null,
      clerkUserId: { not: DEMO_CLERK_USER_ID },
      subscriptions: {
        none: { willRenew: true, status: { in: ['active', 'grace_period', 'billing_retry'] } },
      },
    },
    select: { id: true, clerkUserId: true, createdAt: true, inactivityNoticeSentAt: true },
  });

  const notified: string[] = [];
  const deleted: string[] = [];
  for (const candidate of candidates) {
    const identity = await readIdentity(candidate);
    if (!identity) {
      continue;
    }
    const step = inactivityStep({
      lastActiveAt: identity.lastActiveAt,
      noticeSentAt: candidate.inactivityNoticeSentAt,
      now,
    });
    if (step === 'notify' && (await sendNotice(candidate, identity, now))) {
      notified.push(candidate.id);
    } else if (step === 'clear') {
      await prisma.athleteProfile.update({
        where: { id: candidate.id },
        data: { inactivityNoticeSentAt: null },
      });
    } else if (step === 'delete') {
      await deleteAthleteAccount(candidate.id, now);
      deleted.push(candidate.id);
    }
  }
  return { notified, deleted };
}
