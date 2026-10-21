import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('apex routing', () => {
  it('does not redirect non-existing paths to web (returns 404 instead)', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    // No catch-all wildcard redirecting to web.sharpit.app
    const catchAllToWeb = redirects.find(
      (redirect) =>
        redirect.destination.includes('web.sharpit.app') && redirect.source.includes(':path'),
    );
    expect(catchAllToWeb).toBeUndefined();
  });

  it('serves the landing at the apex root instead of redirecting it', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.some((redirect) => redirect.source === '/')).toBe(false);
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
