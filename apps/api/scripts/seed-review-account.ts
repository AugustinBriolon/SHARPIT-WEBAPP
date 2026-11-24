/**
 * Gives the App Review account the demo's history (sessions, nights, journal, meals, weight)
 * without touching its profile, tier, goals or plan. The account is a regular Clerk user, so the
 * reviewer can write — the shared demo athlete is read-only.
 *
 * Uses the shared client, so Neon is reached over WebSocket (port 443) where 5432 is blocked.
 *
 * Usage (DATABASE_URL and CLERK_SECRET_KEY of the target environment in the env):
 *   yarn db:seed:review review@sharpit.app --dry-run
 *   yarn db:seed:review review@sharpit.app
 *   yarn db:seed:review review@sharpit.app --refresh   (moves the history to today, before a submission)
 */
import { prisma } from '@sharpit/db/client';
import { createClerkClient } from '@clerk/nextjs/server';
import {
  refreshReviewAthleteHistory,
  seedReviewAthleteHistory,
} from '@sharpit/server/lib/demo/seed-demo-data';

const [email] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');

async function main() {
  if (!email) {
    throw new Error('usage: seed-review-account.ts <email> [--dry-run]');
  }
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { data } = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
  if (data.length !== 1) {
    throw new Error(`expected one Clerk user for ${email}, found ${data.length}`);
  }
  const profile = await prisma.athleteProfile.findUnique({
    where: { clerkUserId: data[0]!.id },
    select: { id: true, onboardingCompletedAt: true, tier: true },
  });
  if (!profile) {
    throw new Error(`no athlete for ${email}: sign in once from the app first`);
  }
  const sessions = await prisma.activity.count({ where: { athleteId: profile.id } });
  console.log(
    `athlete ${profile.id} · onboarded ${profile.onboardingCompletedAt?.toISOString() ?? 'no'} · ${profile.tier} · ${sessions} sessions`,
  );
  if (dryRun) {
    return;
  }
  await (refresh ? refreshReviewAthleteHistory : seedReviewAthleteHistory)(prisma, profile.id);
  console.log(
    `seeded: ${await prisma.activity.count({ where: { athleteId: profile.id } })} sessions`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
