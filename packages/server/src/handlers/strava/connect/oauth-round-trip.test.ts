import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const upsert = vi.fn();
const persistSourcePrefsMutation = vi.fn();

vi.mock('server-only', () => ({}));
// Callback binds state to the session when one is present; api. round-trips have none (ADR-048).
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null }),
}));
vi.mock('@sharpit/db/client', () => ({ prisma: { stravaAccount: { upsert } } }));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: async () => 'ath-1',
}));
vi.mock('@sharpit/server/lib/privacy/gate-provider-connect', () => ({
  gateProviderConnect: async () => null,
}));
vi.mock('@sharpit/server/lib/integrations/source-prefs-store', () => ({
  persistSourcePrefsMutation: (...args: unknown[]) => persistSourcePrefsMutation(...args),
}));
// Strava is off in the catalog today; the flow is what is under test.
vi.mock('@sharpit/app/lib/integrations/provider-catalog', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isProviderConnectable: () => true,
}));
vi.mock('@sharpit/server/lib/integrations/strava/strava', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isStravaConfigured: () => true,
  exchangeCodeForToken: async () => ({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000_000,
    athlete: { id: 42, firstname: 'A', lastname: 'B', profile: null },
  }),
}));

/** ADR-048 phase 3: the web starts the connect on `api.`, Strava sends the browser back there. */
describe('Strava connect → callback, with no cookie and no session on the way back', () => {
  beforeEach(() => {
    vi.stubEnv('SECRET_ENCRYPTION_KEY', 'round-trip-test');
    vi.stubEnv('STRAVA_CLIENT_ID', 'client');
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'secret');
    vi.stubEnv('STRAVA_REDIRECT_URI', '');
    upsert.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function startFromTheWeb(): Promise<URL> {
    const { GET } = await import('./handler');
    const response = await GET(
      new NextRequest(
        'https://api.sharpit.app/api/strava/connect?returnTo=/onboarding&dataClass=activities',
        {
          headers: {
            accept: 'application/json',
            origin: 'https://web.sharpit.app',
            host: 'api.sharpit.app',
            'x-forwarded-proto': 'https',
          },
        },
      ),
    );
    expect(response.headers.get('set-cookie')).toBeNull();
    const { url } = (await response.json()) as { url: string };
    return new URL(url);
  }

  it('answers the web with the authorize URL, whose callback is on api.', async () => {
    const authorize = await startFromTheWeb();
    expect(authorize.searchParams.get('redirect_uri')).toBe(
      'https://api.sharpit.app/api/strava/callback',
    );
    expect(authorize.searchParams.get('state')).toBeTruthy();
  });

  it('stores the account for the athlete the state names and lands back on the web', async () => {
    const state = (await startFromTheWeb()).searchParams.get('state')!;
    const { GET } = await import('../callback/handler');
    const response = await GET(
      new NextRequest(
        `https://api.sharpit.app/api/strava/callback?code=c&state=${encodeURIComponent(state)}`,
      ),
    );

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { athleteId: 'ath-1' } }));
    const landing = new URL(response.headers.get('location')!);
    expect(landing.origin).toBe('https://web.sharpit.app');
    expect(landing.pathname).toBe('/onboarding');
    expect(landing.searchParams.get('strava')).toBe('connected');
    expect(landing.searchParams.get('dataClass')).toBe('activities');
    expect(persistSourcePrefsMutation).toHaveBeenCalledWith('ath-1', expect.any(Function));
  });

  it('refuses a forged state and sends the athlete to the web settings', async () => {
    const { GET } = await import('../callback/handler');
    const response = await GET(
      new NextRequest('https://api.sharpit.app/api/strava/callback?code=c&state=forged.state'),
    );

    expect(upsert).not.toHaveBeenCalled();
    const landing = new URL(response.headers.get('location')!);
    expect(landing.origin).toBe('https://web.sharpit.app');
    expect(landing.searchParams.get('strava')).toBe('invalid_state');
  });
});
