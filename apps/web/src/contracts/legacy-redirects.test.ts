import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * The old web's URLs (bookmarks, e-mails, `api.`'s OAuth callbacks) each open their reading
 * in the carnet (ADR-072), as config redirects rather than page files.
 */
describe('legacy redirects', () => {
  it.each([
    ['/carnet/:path*', '/:path*'],
    ['/today', '/'],
    ['/plan/bilan', '/bilans'],
    ['/plan/:path*', '/saison'],
    ['/activite/:id', '/seances/:id'],
    ['/moi/performance', '/records'],
    ['/journal/:path*', '/'],
    ['/coach/:path*', '/'],
    ['/settings/integrations/:path*', '/compte/sources'],
    ['/settings/account', '/compte/donnees'],
    ['/settings/:path*', '/compte'],
    ['/onboarding/:path*', '/'],
  ])('%s → %s', async (source, destination) => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({ source, destination, permanent: false });
  });

  it('tries a specific page before the catch-all of its section', async () => {
    const sources = ((await nextConfig.redirects?.()) ?? []).map((redirect) => redirect.source);
    expect(sources.indexOf('/plan/bilan')).toBeLessThan(sources.indexOf('/plan/:path*'));
    expect(sources.indexOf('/activite/nouvelle')).toBeLessThan(sources.indexOf('/activite/:id'));
    expect(sources.indexOf('/settings/account')).toBeLessThan(sources.indexOf('/settings/:path*'));
    expect(sources.indexOf('/settings/integrations/:path*')).toBeLessThan(
      sources.indexOf('/settings/:path*'),
    );
  });
});
