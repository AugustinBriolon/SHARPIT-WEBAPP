import path from 'node:path';
import type { NextConfig } from 'next';
import { buildContentSecurityPolicy } from '@sharpit/app/lib/security/content-security-policy';

/** Enforced, built from the hosts this deployment talks to (ADR-088). */
const contentSecurityPolicy = buildContentSecurityPolicy({
  apiOrigin: process.env.NEXT_PUBLIC_API_ORIGIN,
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  isDev: process.env.NODE_ENV === 'development',
});

function loadAllowedDevOrigins(): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1']);
  const lanHost = process.env.DEV_LAN_HOST?.trim();
  if (lanHost) hosts.add(lanHost);
  return [...hosts];
}

const nextConfig: NextConfig = {
  // Instant UX, framework side: every route gets a prerendered shell that is
  // served immediately while dynamic content streams in, and <Link> prefetches
  // one reusable shell per route instead of one payload per link.
  // Supersedes experimental.staleTimes, which is gone.
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Keeps a navigation, prefetch or Server Action pending instead of throwing
    // when the network drops, and retries it on reconnect. Also the signal
    // behind useOnlineStatus — it detects real request failures, where
    // navigator.onLine only knows whether an interface is up (ADR-008).
    useOffline: true,
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts', 'motion'],
  },
  turbopack: {},
  // The app lives in apps/web of the monorepo (ADR-048); dependencies are hoisted to its root,
  // so tracing starts there or the deployed functions miss them.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Workspace packages ship TypeScript sources (ADR-048); Next compiles them with the app.
  transpilePackages: ['@sharpit/app', '@sharpit/core', '@sharpit/shared', '@sharpit/ui'],
  allowedDevOrigins: loadAllowedDevOrigins(),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dgalywyr863hv.cloudfront.net',
        pathname: '/pictures/**',
      },
    ],
  },
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
          {
            key: 'Permissions-Policy',
            value:
              'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), midi=(), magnetometer=(), gyroscope=()',
          },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          // Vercel's CDN answers `*` by default; nothing on another origin reads these pages.
          { key: 'Access-Control-Allow-Origin', value: 'https://web.sharpit.app' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // The old web's pages, each to its reading in the carnet (ADR-072). Not permanent: a
      // browser that cached a 308 would keep it if a page moved again. Order matters, the
      // specific before the catch-all; Next carries the query over.
      ...[
        ['/carnet', '/'],
        ['/carnet/:path*', '/:path*'],
        ['/today', '/'],
        ['/today/:path*', '/corps'],
        ['/plan/bilan', '/bilans'],
        ['/plan/:path*', '/saison'],
        ['/activite/nouvelle', '/seances'],
        ['/activite/sejours', '/seances'],
        ['/activite/sejours/:path*', '/seances'],
        ['/activite/:id', '/seances/:id'],
        ['/activite', '/seances'],
        ['/moi/performance', '/records'],
        ['/moi/objectifs/:path*', '/saison'],
        ['/moi/corps', '/corps'],
        ['/moi/:path*', '/compte'],
        ['/journal/:path*', '/'],
        ['/coach/:path*', '/'],
        // `api.`'s OAuth callbacks still answer here; the query carries their outcome.
        ['/settings/integrations/:path*', '/compte/sources'],
        ['/integrations/connected', '/compte/sources'],
        ['/settings/account', '/compte/donnees'],
        ['/settings/privacy', '/compte/donnees'],
        ['/settings/:path*', '/compte'],
        ['/consent', '/'],
        ['/onboarding/:path*', '/'],
        ['/welcome/:path*', '/'],
        ['/~offline', '/'],
      ].map(([source, destination]) => ({ source, destination, permanent: false })),
      // Apex-only pages live on the hub (ADR-051): legal pages and the native Garmin handoff.
      ...['/privacy', '/terms', '/aide', '/connect/:path*', '/.well-known/:path*'].map(
        (source) => ({
          source,
          has: [{ type: 'host' as const, value: 'web.sharpit.app' }],
          destination: `https://sharpit.app${source}`,
          permanent: false,
        }),
      ),
      // The project's own *.vercel.app hosts (renamed from `sharpit` to `sharpit-webapp`).
      ...['sharpit.vercel.app', 'sharpit-webapp.vercel.app'].map((host) => ({
        source: '/:path*',
        has: [{ type: 'host' as const, value: host }],
        destination: 'https://sharpit.app/:path*',
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
