import 'server-only';

import { cacheLife } from 'next/cache';
import type { WebViewer } from '@sharpit/app/lib/web/payloads';
import { serverApiJson } from '@sharpit/ui/server/api-client';

/**
 * How long a page read for the athlete stays true enough to show without asking again (the
 * `minutes` profile: five minutes stale). Every page is a `'use cache: private'` scope with this
 * life, cached in the athlete's browser only and never on the server: five minutes is the least
 * that lets the route's App Shell carry the page, so `<Link>` prefetches it and a navigation
 * shows it at once. A reload always reads afresh.
 */
export const CARNET_FRESHNESS = 'minutes';

/**
 * One read for one section of the carnet. A section that cannot be read says so in place;
 * it never takes the page down, since the rest of the page still has something to say.
 * Called inside a page's private cache only: outside one, the prerender's interrupt on the
 * session would land in the catch and read as a failed section.
 */
export async function readSection<T>(path: string, reviveDateFields = false): Promise<T | null> {
  try {
    return await serverApiJson<T>(path, reviveDateFields);
  } catch (error) {
    console.error('[carnet]', path.split('?')[0], error);
    return null;
  }
}

/** A presentation route answers `{ viewModel }`; the carnet only wants the view model. */
export async function readViewModel<T>(path: string): Promise<T | null> {
  const payload = await readSection<{ viewModel: T }>(path);
  return payload?.viewModel ?? null;
}

/** What the carnet reads of `/api/v1/pro`, the same contract the iPhone reads. */
export type CarnetPro = {
  tier: 'FREE' | 'PRO';
  subscription: {
    status: 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'revoked';
    source: 'apple' | 'stripe' | 'manual';
    renewsAt: string | null;
    expiresAt: string | null;
    willRenew: boolean;
  } | null;
};

export async function readPro(): Promise<CarnetPro | null> {
  return readSection<CarnetPro>('/api/v1/pro');
}

/**
 * Who is reading: `api.` resolves (or provisions) the athlete and says whether the account
 * still owes consents or onboarding. Null when it cannot be read; the pages then try anyway.
 */
export async function readViewer(): Promise<WebViewer | null> {
  'use cache: private';
  const viewer = await readSection<WebViewer>('/api/web/viewer');
  // An account that owes a step is read afresh each time: kept five minutes, the « Encore une
  // étape » it shows would outlive the consents just given in Compte.
  if (viewer?.consentWallHref || viewer?.needsOnboarding) {
    cacheLife('seconds');
  } else {
    cacheLife(CARNET_FRESHNESS);
  }
  return viewer;
}
