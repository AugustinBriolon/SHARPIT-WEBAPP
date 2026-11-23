import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * `api.sharpit.app` (ADR-048): route handlers only, mounted from `@sharpit/server`. Same
 * route-handler semantics as the web app (`cacheComponents`), no pages.
 */
const nextConfig: NextConfig = {
  // CI typechecks every commit and Deploy only runs once CI is green, so the Vercel build
  // skips its own pass instead of paying for it twice.
  typescript: { ignoreBuildErrors: true },
  cacheComponents: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: [
    '@sharpit/app',
    '@sharpit/core',
    '@sharpit/db',
    '@sharpit/server',
    '@sharpit/shared',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
