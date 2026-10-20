import { describe, expect, it } from 'vitest';
import { runMustPrivateSmoke } from './must-private-smoke';

const ORIGIN = 'https://sharpit.app';
const BEARER = 'bearer-test-value';
const DAY = '2026-09-25';

type Reply = { status: number; headers?: Record<string, string>; body?: string };

const HEALTHY: Record<string, Reply> = {
  '/.well-known/apple-app-site-association': {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: '{"applinks":{"details":[{"appIDs":["ABCDE12345.app.sharpit.ios"],"components":[{"/":"/connect/strava/callback*"}]}]}}',
  },
  '/connect/strava/start': {
    status: 307,
    headers: {
      location: '/sign-in?redirect_url=https%3A%2F%2Fsharpit.app%2Fconnect%2Fstrava%2Fstart',
    },
  },
  '/connect/strava/callback?strava=connected': {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  },
  [`/api/v1/today?trainingDayId=${DAY}`]: {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: '{}',
  },
};

function fakeFetcher(overrides: Record<string, Reply> = {}) {
  const calls: { path: string; init: RequestInit }[] = [];
  const replies = { ...HEALTHY, ...overrides };
  const fetcher = async (url: string, init: RequestInit) => {
    const path = url.slice(ORIGIN.length);
    calls.push({ path, init });
    const reply = replies[path];
    return new Response(reply.body ?? '', { status: reply.status, headers: reply.headers });
  };
  return { fetcher, calls };
}

function outcomes(results: { outcome: string }[]) {
  return results.map((result) => result.outcome);
}

describe('runMustPrivateSmoke', () => {
  it('passes every check against a healthy origin', async () => {
    const { fetcher } = fakeFetcher();

    const results = await runMustPrivateSmoke(ORIGIN, {
      bearer: BEARER,
      trainingDayId: DAY,
      fetcher,
    });

    expect(outcomes(results)).toEqual(['pass', 'pass', 'pass', 'pass']);
  });

  it('sends the Bearer to the API only, and never follows redirects', async () => {
    const { fetcher, calls } = fakeFetcher();

    await runMustPrivateSmoke(ORIGIN, { bearer: BEARER, trainingDayId: DAY, fetcher });

    const withBearer = calls.filter((call) => JSON.stringify(call.init.headers).includes(BEARER));
    expect(withBearer.map((call) => call.path)).toEqual([`/api/v1/today?trainingDayId=${DAY}`]);
    expect(calls.every((call) => call.init.redirect === 'manual')).toBe(true);
  });

  it('skips the authenticated check without a Bearer', async () => {
    const { fetcher, calls } = fakeFetcher();

    const results = await runMustPrivateSmoke(ORIGIN, { trainingDayId: DAY, fetcher });

    expect(outcomes(results)).toEqual(['pass', 'pass', 'pass', 'skipped']);
    expect(calls).toHaveLength(3);
  });

  it('fails an AASA that redirects or still carries the placeholder Team ID', async () => {
    const redirected = fakeFetcher({
      '/.well-known/apple-app-site-association': { status: 308, headers: { location: '/x' } },
    });
    const placeholder = fakeFetcher({
      '/.well-known/apple-app-site-association': {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"appIDs":["APPLE_TEAM_ID_NOT_SET.app.sharpit.ios"],"/":"/connect/strava/callback*"}',
      },
    });

    const [first] = await runMustPrivateSmoke(ORIGIN, {
      trainingDayId: DAY,
      fetcher: redirected.fetcher,
    });
    const [second] = await runMustPrivateSmoke(ORIGIN, {
      trainingDayId: DAY,
      fetcher: placeholder.fetcher,
    });

    expect(first).toMatchObject({ outcome: 'fail', reason: 'expected 200, got 308' });
    expect(second).toMatchObject({ outcome: 'fail', reason: 'APPLE_TEAM_ID not set' });
  });

  it('fails a Strava entry that sends sign-in to another host', async () => {
    const { fetcher } = fakeFetcher({
      '/connect/strava/start': {
        status: 307,
        headers: { location: 'https://web.sharpit.app/sign-in?redirect_url=x' },
      },
    });

    const results = await runMustPrivateSmoke(ORIGIN, { trainingDayId: DAY, fetcher });

    expect(results[1]).toMatchObject({ outcome: 'fail' });
  });

  it('fails Today answered with HTML and never echoes the Bearer', async () => {
    const { fetcher } = fakeFetcher({
      [`/api/v1/today?trainingDayId=${DAY}`]: {
        status: 404,
        headers: { 'content-type': 'text/html' },
      },
    });

    const results = await runMustPrivateSmoke(ORIGIN, {
      bearer: BEARER,
      trainingDayId: DAY,
      fetcher,
    });

    expect(results[3]).toMatchObject({ outcome: 'fail', reason: 'expected 200, got 404' });
    expect(JSON.stringify(results)).not.toContain(BEARER);
  });

  it('names why Clerk refused the Bearer', async () => {
    const { fetcher } = fakeFetcher({
      [`/api/v1/today?trainingDayId=${DAY}`]: {
        status: 404,
        headers: { 'content-type': 'text/html', 'x-clerk-auth-reason': 'token-expired' },
      },
    });

    const results = await runMustPrivateSmoke(ORIGIN, {
      bearer: BEARER,
      trainingDayId: DAY,
      fetcher,
    });

    expect(results[3]).toMatchObject({
      outcome: 'fail',
      reason: 'expected 200, got 404 (clerk: token-expired)',
    });
  });

  it('reports a network failure without throwing', async () => {
    const fetcher = async () => {
      throw new TypeError('fetch failed');
    };

    const results = await runMustPrivateSmoke(ORIGIN, { trainingDayId: DAY, fetcher });

    expect(outcomes(results)).toEqual(['fail', 'fail', 'fail', 'skipped']);
  });
});
