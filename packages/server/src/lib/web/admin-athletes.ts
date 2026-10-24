import { clerkClient } from '@clerk/nextjs/server';
import {
  listAthletesForAdmin,
  loadAiCost,
  loadPlanAdherence,
} from '@sharpit/server/lib/admin/queries';
import type { AdminAthleteView } from '@sharpit/app/lib/web/payloads';
import { isDevClerkBypass } from '@sharpit/app/lib/dev/dev-auth';

export type { AdminAthleteView };

async function emailsByClerkId(clerkUserIds: string[]): Promise<Map<string, string>> {
  if (isDevClerkBypass() || clerkUserIds.length === 0) {
    return new Map();
  }
  const client = await clerkClient();
  const { data } = await client.users.getUserList({
    userId: clerkUserIds,
    limit: clerkUserIds.length,
  });
  return new Map(
    data
      .filter((user) => user.primaryEmailAddress)
      .map((user) => [user.id, user.primaryEmailAddress!.emailAddress]),
  );
}

/** The /admin athlete list with each account's email (operator tooling, admins only). */
export async function loadAdminAthletes(): Promise<AdminAthleteView[]> {
  const athletes = await listAthletesForAdmin();
  const [emails, adherence, aiCost] = await Promise.all([
    emailsByClerkId(athletes.map((athlete) => athlete.clerkUserId)),
    loadPlanAdherence(),
    loadAiCost(),
  ]);
  return athletes.map((athlete) => ({
    ...athlete,
    email: emails.get(athlete.clerkUserId) ?? null,
    adherence: adherence.get(athlete.id) ?? null,
    aiCost: aiCost.get(athlete.id) ?? null,
  }));
}
