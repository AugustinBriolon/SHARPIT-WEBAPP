import { type ReactNode, Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { CarnetHeading } from '@/components/carnet/carnet-animated';
import { CarnetAccountLink, CarnetNav } from '@/components/carnet/carnet-nav';
import { CarnetPageSkeleton } from '@/components/carnet/carnet-parts';

/**
 * The web is the carnet: a place to read, the iPhone app the place to act (ADR-072).
 * One header, one row of pages, and the page under it.
 */

export const metadata: Metadata = {
  title: { default: 'SharpIt', template: '%s · SharpIt' },
  robots: { index: false, follow: false },
};

// Every page reads the signed-in athlete through `api.`: nothing to prerender.
export const instant = false;

export default function CarnetLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-full">
      <header className="border-border/70 bg-background/90 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-4 pb-3 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link className="group flex items-center gap-2" href="/">
              <BrandMark className="size-6 transition-transform duration-500 ease-out group-hover:rotate-[60deg] motion-reduce:transition-none" />
              <span className="text-card-title">SharpIt</span>
            </Link>
            <CarnetAccountLink />
          </div>
          <CarnetNav />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-10 sm:px-8">
        {/* Every page reads the athlete at request time: the header paints at once, the
            page streams in under it. */}
        <Suspense fallback={<CarnetPageSkeleton />}>
          <CarnetHeading>{children}</CarnetHeading>
        </Suspense>
      </main>
    </div>
  );
}
