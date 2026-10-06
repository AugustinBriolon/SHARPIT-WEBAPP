import 'server-only';

import { connection } from 'next/server';
import type { WebViewer } from '@sharpit/app/lib/web/payloads';
import { serverApiJson } from '@sharpit/ui/server/api-client';

/**
 * One read for one section of the carnet. A section that cannot be read says so in place;
 * it never takes the page down, since the rest of the page still has something to say.
 */
export async function readSection<T>(path: string, reviveDateFields = false): Promise<T | null> {
  // Outside try: every read is the signed-in athlete's, so the prerender stops here rather
  // than inside the catch, which would swallow its interrupt as a failed read.
  await connection();
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
  return readSection<WebViewer>('/api/web/viewer');
}
