import { SENTRY_DSN } from '@sharpit/app/lib/observability/sentry-options';

/**
 * The enforced Content-Security-Policy of the web and hub apps (ADR-088).
 *
 * Scripts keep `'unsafe-inline'`: both apps serve prerendered shells (`cacheComponents`), whose
 * inline bootstrap and flight-data scripts are written at build time, so a per-request nonce
 * cannot reach them, and a nonce would turn every route dynamic. What the policy does enforce:
 * scripts, connections and frames only from the hosts named here (no wildcard), no plugins, no
 * `<base>` rewrite, no framing, forms posting only to the app.
 */
export type ContentSecurityPolicyInput = {
  /** `NEXT_PUBLIC_API_ORIGIN` — the browser calls `api.` with a Bearer token. */
  apiOrigin?: string;
  /** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — names the instance's Frontend API host. */
  clerkPublishableKey?: string;
  isDev: boolean;
};

const CLOUDFLARE_TURNSTILE = 'https://challenges.cloudflare.com';
const MAP_TILES = ['https://basemaps.cartocdn.com', 'https://*.basemaps.cartocdn.com'];
/** Development instances of Clerk report usage there; production ones do not. */
const CLERK_DEV_TELEMETRY = 'https://clerk-telemetry.com';

/** `pk_<env>_<base64("frontend-api-host$")>` → `https://frontend-api-host`. */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const encoded = publishableKey?.split('_')[2];
  if (!encoded) {
    return null;
  }
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
}

function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

function present(values: Array<string | null | false>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

export function buildContentSecurityPolicy(input: ContentSecurityPolicyInput): string {
  const clerk = clerkFrontendApiOrigin(input.clerkPublishableKey);
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // React reads server error stacks with eval in development only.
    'script-src': present([
      "'self'",
      "'unsafe-inline'",
      input.isDev && "'unsafe-eval'",
      clerk,
      CLOUDFLARE_TURNSTILE,
    ]),
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': present([
      "'self'",
      originOf(input.apiOrigin),
      clerk,
      ...MAP_TILES,
      originOf(SENTRY_DSN),
      input.isDev && CLERK_DEV_TELEMETRY,
    ]),
    'frame-src': present(["'self'", clerk, CLOUDFLARE_TURNSTILE]),
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${[...new Set(sources)].join(' ')}`)
    .join('; ');
}
