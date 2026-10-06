import type { ReactNode } from 'react';
import { CarnetStepLink } from '@/components/carnet/carnet-parts';
import { requireAdmin } from '@sharpit/app/lib/auth/admin';

/**
 * Deliberately outside the `(carnet)` route group: no athlete header or nav —
 * this is operator tooling, not part of the athlete experience. Session auth still comes from the global middleware;
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
        <CarnetStepLink className="-ml-2.5" direction="back" href="/">
          Carnet
        </CarnetStepLink>
        {children}
      </div>
    </div>
  );
}
