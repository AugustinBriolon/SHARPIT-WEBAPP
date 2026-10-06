import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/** The apex serves its own paths and hands every other one to the web, path kept (ADR-051). */
async function webRedirect() {
  const [redirect] = (await nextConfig.redirects?.()) ?? [];
  const pattern = /^\/:path\((.+)\)$/.exec(redirect.source)?.[1] ?? '';
  return { redirect, matches: (path: string) => new RegExp(`^/${pattern}$`).test(path) };
}

describe('apex routing', () => {
  it('keeps the iOS contract on the apex', async () => {
    const { matches } = await webRedirect();
    for (const path of [
      '/.well-known/apple-app-site-association',
      '/connect/garmin',
      '/connect/garmin/start',
      '/connect/garmin/callback',
      '/privacy',
      '/terms',
      '/aide',
      '/aide/sources/garmin',
      '/sign-in',
      '/api/billing/apple/notifications',
      '/api/v1/today',
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it('sends everything else to the web, path kept, not permanently', async () => {
    const { redirect, matches } = await webRedirect();
    for (const path of ['/welcome', '/demo', '/sign-up', '/activite/abc', '/settings']) {
      expect(matches(path), path).toBe(true);
    }
    expect(redirect.destination).toBe('https://web.sharpit.app/:path');
    expect(redirect.permanent).toBe(false);
  });

  it('serves the landing at the apex root instead of redirecting it', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.some((redirect) => redirect.source === '/')).toBe(false);
    const { matches } = await webRedirect();
    expect(matches('/')).toBe(false);
  });

  it('sends apex API calls to api., method and body kept', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const apiRedirect = redirects.find((redirect) => redirect.source.startsWith('/api/'));
    expect(apiRedirect).toMatchObject({
      destination: 'https://api.sharpit.app/api/:path',
      permanent: true,
    });
    const pattern = /^\/api\/:path\((.+)\)$/.exec(apiRedirect?.source ?? '')?.[1] ?? '';
    const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);
    expect(matches('v1/today')).toBe(true);
    expect(matches('billing/apple/verify')).toBe(true);
    expect(matches('billing/apple/notifications')).toBe(false);
  });

  it('proxies App Store notifications to api. instead of redirecting them', async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toContainEqual({
      source: '/api/billing/apple/notifications',
      destination: 'https://api.sharpit.app/api/billing/apple/notifications',
    });
  });
});
