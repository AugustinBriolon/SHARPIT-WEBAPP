import { type ReactNode, Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { requireAdmin } from '@sharpit/app/lib/auth/admin';
import { CarnetAccountLink, CarnetNav } from '@/components/carnet/carnet-nav';
import { CarnetPageSkeleton } from '@/components/carnet/carnet-parts';

/**
 * The carnet: the web as a place to read, the iPhone app as the place to act (ADR-072).
 * Built beside the current web app and shown to admins only until the switch-over, so
 * nothing an athlete uses today changes. Outside the `(app)` group on purpose: no bottom
 * nav, no onboarding or consent gate — a reader of an existing account.
 */

export const metadata: Metadata = {
  title: 'Carnet · SharpIt',
  robots: { index: false, follow: false },
};

// Every page reads the signed-in athlete through `api.`: nothing to prerender.
export const instant = false;

export default async function CarnetLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="bg-background text-foreground min-h-full">
      <header className="border-border/70 bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-4 pb-3 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link className="flex items-center gap-2" href="/carnet">
              <BrandMark className="size-6" />
              <span className="text-card-title">SharpIt</span>
              <span className="text-label text-muted-foreground ml-1">Carnet</span>
            </Link>
            <CarnetAccountLink />
          </div>
          <CarnetNav />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-10 sm:px-8">
        {/* Every page reads the athlete at request time: the shell and the nav paint at
            once, the page streams in under them. */}
        <Suspense fallback={<CarnetPageSkeleton />}>{children}</Suspense>
      </main>
    </div>
  );
}
