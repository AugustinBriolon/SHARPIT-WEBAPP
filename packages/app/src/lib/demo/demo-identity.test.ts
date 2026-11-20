import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserList = vi.fn();
const createUser = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { getUserList, createUser } }),
}));

describe('demo identity', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await import('./demo-identity')).resetDemoIdentityCache();
  });

  it('creates the demo user once, then reuses it without asking Clerk again', async () => {
    getUserList.mockResolvedValue({ data: [] });
    createUser.mockResolvedValue({ id: 'user_demo' });
    const { ensureDemoClerkUser, isDemoClerkUser } = await import('./demo-identity');

    await expect(ensureDemoClerkUser()).resolves.toBe('user_demo');
    await expect(ensureDemoClerkUser()).resolves.toBe('user_demo');
    await expect(isDemoClerkUser('user_demo')).resolves.toBe(true);

    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'sharpit-demo', skipPasswordRequirement: true }),
    );
    expect(getUserList).toHaveBeenCalledTimes(1);
  });

  it('finds an existing demo user instead of creating another', async () => {
    getUserList.mockResolvedValue({ data: [{ id: 'user_demo' }] });
    const { ensureDemoClerkUser } = await import('./demo-identity');

    await expect(ensureDemoClerkUser()).resolves.toBe('user_demo');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('treats a failed lookup as "not the demo user" and retries next time', async () => {
    getUserList.mockRejectedValueOnce(new Error('clerk down'));
    getUserList.mockResolvedValueOnce({ data: [{ id: 'user_demo' }] });
    const { isDemoClerkUser } = await import('./demo-identity');

    await expect(isDemoClerkUser('user_demo')).resolves.toBe(false);
    await expect(isDemoClerkUser('user_demo')).resolves.toBe(true);
  });
});

describe('demo identity from the environment', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await import('./demo-identity')).resetDemoIdentityCache();
  });

  it('reads DEMO_CLERK_USER_ID without asking Clerk', async () => {
    vi.stubEnv('DEMO_CLERK_USER_ID', 'user_demo_env');
    const { isDemoClerkUser } = await import('./demo-identity');

    await expect(isDemoClerkUser('user_demo_env')).resolves.toBe(true);
    await expect(isDemoClerkUser('user_athlete')).resolves.toBe(false);
    expect(getUserList).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe('isDemoBlockedRequest', () => {
  it('blocks writes and provider connects, lets reads through', async () => {
    const { isDemoBlockedRequest } = await import('./demo-identity-shared');

    expect(isDemoBlockedRequest('POST', '/api/goals')).toBe(true);
    expect(isDemoBlockedRequest('DELETE', '/api/goals/1')).toBe(true);
    expect(isDemoBlockedRequest('GET', '/api/strava/connect')).toBe(true);
    expect(isDemoBlockedRequest('GET', '/api/presentation/today')).toBe(false);
    expect(isDemoBlockedRequest('OPTIONS', '/api/goals')).toBe(false);
    expect(isDemoBlockedRequest('POST', '/sign-in')).toBe(false);
  });
});
