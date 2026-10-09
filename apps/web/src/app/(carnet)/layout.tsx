import { type ReactNode, Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { CarnetHeading } from '@/components/carnet/carnet-animated';
import {
  CarnetAccountLink,
  CarnetAccountLinkFor,
  CarnetNav,
  CarnetNavRow,
} from '@/components/carnet/carnet-nav';
import { CarnetSkeletonFrame } from '@/components/carnet/carnet-skeleton';

/**
 * The web is the carnet: a place to read, the iPhone app the place to act (ADR-072).
 * One header, one row of pages, and the page under it.
 */

export const metadata: Metadata = {
  title: { default: 'SharpIt', template: '%s · SharpIt' },
  robots: { index: false, follow: false },
};

export default function CarnetLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-full">
      <header className="border-border/70 bg-background/90 [@media(prefers-reduced-transparency:reduce)]:bg-background sticky top-0 z-10 border-b backdrop-blur-md [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none">
        <div className="safe-page-top mx-auto flex max-w-5xl flex-col gap-3 px-4 pb-3 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link className="group flex items-center gap-2" href="/">
              <BrandMark className="size-6 transition-transform duration-300 ease-out group-hover:rotate-[60deg] motion-reduce:transition-none motion-reduce:group-hover:rotate-0" />
              <span className="text-card-title">SharpIt</span>
            </Link>
            <Suspense fallback={<CarnetAccountLinkFor pathname={null} />}>
              <CarnetAccountLink />
            </Suspense>
          </div>
          <Suspense fallback={<CarnetNavRow pathname={null} />}>
            <CarnetNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-10 sm:px-8">
        {/* The header paints at once; each page's `loading.tsx` holds its place under it.
            This boundary only serves a session's page loaded cold, whose address (its id)
            is read at request time: a navigation never reaches it. */}
        <Suspense fallback={<CarnetSkeletonFrame label="" />}>
          <CarnetHeading>{children}</CarnetHeading>
        </Suspense>
      </main>
    </div>
  );
}
