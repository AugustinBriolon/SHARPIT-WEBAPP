// No `server-only`: the proxies (middleware bundle) import it; `clerkClient` keeps it server-side.
import { clerkClient } from '@clerk/nextjs/server';
import { DEMO_EMAIL, DEMO_EXTERNAL_ID } from '@sharpit/app/lib/demo/demo-identity-shared';

export {
  DEMO_EXTERNAL_ID,
  DEMO_READ_ONLY_ERROR,
  isDemoBlockedRequest,
} from '@sharpit/app/lib/demo/demo-identity-shared';

/** The demo user never changes once created: one lookup per server instance. */
let knownDemoUserId: string | null = null;

/**
 * `DEMO_CLERK_USER_ID`, when set, names the demo user without asking Clerk: the lookup is
 * otherwise a Backend API round trip on the first authenticated request of every cold instance
 * (`getCurrentAthleteId` → `isDemoSession`).
 */
async function findDemoUserId(): Promise<string | null> {
  if (knownDemoUserId) {
    return knownDemoUserId;
  }
  const configured = process.env.DEMO_CLERK_USER_ID?.trim();
  if (configured) {
    knownDemoUserId = configured;
    return configured;
  }
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ externalId: [DEMO_EXTERNAL_ID], limit: 1 });
  knownDemoUserId = data[0]?.id ?? null;
  return knownDemoUserId;
}

/** True when this Clerk user is the shared demo tenant. */
export async function isDemoClerkUser(userId: string): Promise<boolean> {
  try {
    return userId === (await findDemoUserId());
  } catch (error) {
    console.error('[demo] demo user lookup failed', { name: (error as Error)?.name });
    return false;
  }
}

/** The demo Clerk user, created on the first visit to `/demo`. */
export async function ensureDemoClerkUser(): Promise<string> {
  const existing = await findDemoUserId();
  if (existing) {
    return existing;
  }
  const client = await clerkClient();
  const user = await client.users.createUser({
    externalId: DEMO_EXTERNAL_ID,
    emailAddress: [DEMO_EMAIL],
    firstName: 'Démo',
    skipPasswordRequirement: true,
    publicMetadata: { demo: true },
  });
  knownDemoUserId = user.id;
  return user.id;
}

/** Test seam: forget the cached demo user id. */
export function resetDemoIdentityCache(): void {
  knownDemoUserId = null;
}
