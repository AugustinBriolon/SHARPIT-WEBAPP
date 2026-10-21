import { isUniqueViolation } from '@sharpit/server/lib/prisma-errors';
import { cache } from 'react';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { DEMO_CLERK_USER_ID, isDemoSession } from '@sharpit/app/lib/demo/demo-session';
import { ensureDemoSeedFresh } from '@sharpit/server/lib/demo/seed-demo-data';
import { prisma } from '@sharpit/db/client';
import { isDevClerkBypass } from '@sharpit/app/lib/dev/dev-auth';
import {
  eraseAthleteData,
  restoreAthleteAccount,
} from '@sharpit/server/lib/privacy/account-deletion';
import { isDueForPrivacyPurge } from '@sharpit/server/lib/privacy/consent';

const DEACTIVATED_ACCOUNT_ERROR = 'Compte supprimé';

function assertAthleteActive(deletedAt: Date | null): void {
  if (deletedAt) {
    throw new Error(DEACTIVATED_ACCOUNT_ERROR);
  }
}

async function resolveDevBypassAthleteId(): Promise<string> {
  const athlete = await prisma.athleteProfile.findFirstOrThrow({
    where: { deletedAt: null, NOT: { clerkUserId: DEMO_CLERK_USER_ID } },
    orderBy: { createdAt: 'asc' },
  });
  return athlete.id;
}

async function resolveDemoAthleteId(): Promise<string> {
  // The first demo read after a reseed window blocks here so first paint has data.
  await ensureDemoSeedFresh(prisma);
  const demoAthlete = await prisma.athleteProfile.findUniqueOrThrow({
    where: { clerkUserId: DEMO_CLERK_USER_ID },
    select: { id: true, deletedAt: true },
  });
  assertAthleteActive(demoAthlete.deletedAt);
  return demoAthlete.id;
}

/**
 * A deletion still in flight: `/api/privacy/delete` marks the row, then deletes the
 * identity and the rows within the same request. A parallel request from the same
 * session must not treat that as a comeback.
 */
const DELETION_SETTLE_MS = 5 * 60 * 1000;

/**
 * A profile marked deleted whose identity signs back in — an account deleted under the
 * former 30-day soft-delete, or one whose deletion stopped midway. The athlete asked
 * for deletion, so it completes now and they start from zero on a fresh profile.
 */
async function restartAfterDeletion(
  userId: string,
  deleted: { id: string; deletedAt: Date },
): Promise<string> {
  if (Date.now() - deleted.deletedAt.getTime() < DELETION_SETTLE_MS) {
    assertAthleteActive(deleted.deletedAt);
  }
  await eraseAthleteData(deleted.id);
  return createAthleteProfile(userId);
}

/**
 * A session token outlives its Clerk user by up to a minute: never provision a profile
 * for an identity that was just deleted. Only a confirmed 404 counts — a Clerk hiccup
 * must not block a real first sign-in.
 */
async function assertClerkIdentityExists(userId: string): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.getUser(userId);
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404) {
      throw new Error(DEACTIVATED_ACCOUNT_ERROR);
    }
  }
}

async function findOrCreateAthleteProfile(userId: string): Promise<string> {
  const existing = await prisma.athleteProfile.findUnique({
    where: { clerkUserId: userId },
    select: { id: true, deletedAt: true },
  });
  if (existing?.deletedAt) {
    if (Date.now() - existing.deletedAt.getTime() < DELETION_SETTLE_MS) {
      assertAthleteActive(existing.deletedAt);
    }
    if (isDueForPrivacyPurge({ deletedAt: existing.deletedAt, now: new Date() })) {
      return restartAfterDeletion(userId, { id: existing.id, deletedAt: existing.deletedAt });
    }
    // Signing back in during the 14-day grace period cancels the pending deletion
    await restoreAthleteAccount(existing.id);
    return existing.id;
  }
  if (existing) {
    return existing.id;
  }
  return createAthleteProfile(userId);
}

async function createAthleteProfile(userId: string): Promise<string> {
  await assertClerkIdentityExists(userId);
  try {
    const created = await prisma.athleteProfile.create({ data: { clerkUserId: userId } });
    return created.id;
  } catch (error) {
    // Two concurrent first-requests from the same brand-new user raced the
    // create — the loser reads back what the winner just inserted.
    if (isUniqueViolation(error)) {
      const raced = await prisma.athleteProfile.findUniqueOrThrow({
        where: { clerkUserId: userId },
        select: { id: true, deletedAt: true },
      });
      assertAthleteActive(raced.deletedAt);
      return raced.id;
    }
    throw error;
  }
}

/**
 * Resolves the signed-in Clerk user to their `AthleteProfile.id` (ADR-025).
 *
 * Lazily provisions a fresh, empty profile on a brand-new Clerk user's first
 * authenticated request — there is no `user.created` webhook, so this is the
 * substitute. `findUnique` before `create` avoids bumping `updatedAt` on
 * every request for an athlete who already has a profile.
 *
 * `cache()`-wrapped like `getAthleteProfile` (`src/lib/queries/index.ts`) —
 * deduped within one request/render tree, not across requests.
 */
export const getCurrentAthleteId = cache(async (): Promise<string> => {
  // When Clerk's backend is unreachable (corporate proxy / SSL inspection),
  // the proxy skips auth.protect() entirely — there is no session to resolve.
  // Single-athlete dev fallback: the one existing profile row.
  if (isDevClerkBypass()) {
    return resolveDevBypassAthleteId();
  }

  // Public read-only demo: the shared demo Clerk user maps to the demo tenant, never to a
  // profile of its own.
  if (await isDemoSession()) {
    return resolveDemoAthleteId();
  }

  const { userId } = await auth();
  if (!userId) {
    throw new Error('getCurrentAthleteId called without an authenticated session');
  }

  return findOrCreateAthleteProfile(userId);
});
