import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@sharpit/app/lib/auth/admin';

/**
 * Deliberately outside the `(app)` route group: no athlete shell, no
 * onboarding gate, no bottom nav — this is operator tooling, not part of the
 * athlete experience. Session auth still comes from the global middleware;
 * this layout adds the admin-only check on top of it.
 */

// Every render is athlete-private (Clerk session) and reads fresh DB state —
// there is no static shell worth prerendering for an operator-only route.
export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="bg-background text-foreground min-h-full">
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-10">
        <Link
          className="text-muted-foreground hover:text-foreground text-data inline-flex items-center gap-1.5 text-xs transition-colors"
          href="/"
        >
          ← Retour à l&apos;app
        </Link>
        <Link
          className="text-muted-foreground hover:text-foreground text-data ml-4 inline-flex items-center gap-1.5 text-xs transition-colors"
          href="/carnet"
        >
          Carnet (aperçu) →
        </Link>
        {children}
      </div>
    </div>
  );
}
