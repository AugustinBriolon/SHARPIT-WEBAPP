import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * sharpit.app, the apex (ADR-048 phase 4, ADR-051): the Apple app-site association, the native
 * Garmin handoff (`/connect/*`, immutable for iOS), the legal pages and the sign-in that redeems
 * a handoff ticket, the public landing at `/` and the help centre at `/aide`. Every other path belongs to the web app on
 * `web.sharpit.app`.
 */
const WEB_ORIGIN = 'https://web.sharpit.app';
const API_ORIGIN = 'https://api.sharpit.app';

/**
 * App Store Server Notifications may still be registered on the apex (ADR-044). Apple is not
 * known to follow redirects, so this one path is proxied to `api.`, which verifies the signature.
 */
const APPLE_NOTIFICATIONS_PATH = '/api/billing/apple/notifications';

/** Paths the hub serves or forwards itself; everything else goes to the web, path and query kept. */
const HUB_PATHS =
  '\\.well-known|aide|connect|privacy|terms|sign-in|api/|_next|__clerk|favicon\\.ico|icon|apple-icon';

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://clerk.sharpit.app",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.sharpit.app https://clerk.sharpit.app https://*.clerk.accounts.dev https://*.clerk.com",
  "frame-src 'self' https://clerk.sharpit.app https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://sso.garmin.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@sharpit/app', '@sharpit/core', '@sharpit/shared', '@sharpit/ui'],
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
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: `/:path((?!${HUB_PATHS}).+)`,
        destination: `${WEB_ORIGIN}/:path`,
        permanent: false,
      },
      // Clients still calling the apex API (pre-`api.` builds): 308 keeps the method and body.
      {
        source: '/api/:path((?!billing/apple/notifications$).*)',
        destination: `${API_ORIGIN}/api/:path`,
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      { source: APPLE_NOTIFICATIONS_PATH, destination: `${API_ORIGIN}${APPLE_NOTIFICATIONS_PATH}` },
    ];
  },
};

export default nextConfig;
