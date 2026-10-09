import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  connectStateMatchesSession,
  type ConnectState,
  createConnectState,
  readConnectState,
} from './oauth-state';

const state: ConnectState = {
  provider: 'strava',
  athleteId: 'ath-1',
  returnTo: '/onboarding',
  dataClass: 'activities',
  webOrigin: 'https://web.sharpit.app',
  redirectUri: 'https://api.sharpit.app/api/strava/callback',
};

describe('connect state', () => {
  beforeEach(() => {
    vi.stubEnv('SECRET_ENCRYPTION_KEY', 'test-key');
    vi.mocked(auth).mockReset();
    vi.mocked(getCurrentAthleteId).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('carries the connect context through the provider round trip', () => {
    expect(readConnectState(createConnectState(state), 'strava')).toEqual(state);
  });

  it('is bound to the provider it was issued for', () => {
    expect(readConnectState(createConnectState(state), 'withings')).toBeNull();
  });

  it('expires after ten minutes', () => {
    vi.useFakeTimers();
    const raw = createConnectState(state);
    vi.advanceTimersByTime(601_000);
    expect(readConnectState(raw, 'strava')).toBeNull();
  });

  it('refuses a missing or forged state', () => {
    expect(readConnectState(null, 'strava')).toBeNull();
    expect(readConnectState('forged.state', 'strava')).toBeNull();
  });
});

describe('connectStateMatchesSession', () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(getCurrentAthleteId).mockReset();
  });

  it('accepts the signed state alone when no Clerk session is on the host', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    await expect(connectStateMatchesSession(state)).resolves.toBe(true);
    expect(getCurrentAthleteId).not.toHaveBeenCalled();
  });

  it('requires the session athlete to match the signed state', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user-1' } as never);
    vi.mocked(getCurrentAthleteId).mockResolvedValue('ath-1');
    await expect(connectStateMatchesSession(state)).resolves.toBe(true);

    vi.mocked(getCurrentAthleteId).mockResolvedValue('ath-other');
    await expect(connectStateMatchesSession(state)).resolves.toBe(false);
  });

  it('rejects when a session is present but the athlete cannot be resolved', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user-1' } as never);
    vi.mocked(getCurrentAthleteId).mockRejectedValue(new Error('unauthenticated'));
    await expect(connectStateMatchesSession(state)).resolves.toBe(false);
  });
});
