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

/**
 * The web is the carnet: a place to read, the iPhone app the place to act (ADR-072).
 * One header with the pages (a rail beside the sheet on a wide screen), and the page under it.
 */

export const metadata: Metadata = {
  title: { default: 'SharpIt', template: '%s · SharpIt' },
  robots: { index: false, follow: false },
};

export default function CarnetLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card text-foreground lg:bg-background min-h-full lg:flex">
      <header className="border-border bg-card/90 [@media(prefers-reduced-transparency:reduce)]:bg-card sticky top-0 z-10 border-b backdrop-blur-md lg:h-dvh lg:w-56 lg:shrink-0 lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none">
        <div className="safe-page-top flex flex-col gap-3 px-4 pb-3 sm:px-8 lg:h-full lg:gap-6 lg:px-4 lg:py-7">
          <div className="flex items-center justify-between gap-4 lg:px-3.5">
            <Link className="group flex items-center gap-2.5" href="/">
              <BrandMark className="size-6 transition-transform duration-300 ease-out group-hover:rotate-[60deg] motion-reduce:transition-none motion-reduce:group-hover:rotate-0" />
              <span className="text-card-title">SharpIt</span>
            </Link>
            <div className="lg:hidden">
              <Suspense fallback={<CarnetAccountLinkFor pathname={null} />}>
                <CarnetAccountLink />
              </Suspense>
            </div>
          </div>
          <Suspense fallback={<CarnetNavRow pathname={null} />}>
            <CarnetNav />
          </Suspense>
          <div className="mt-auto hidden lg:block">
            <Suspense fallback={<CarnetAccountLinkFor pathname={null} />}>
              <CarnetAccountLink />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1 lg:p-4 lg:pl-0">
        {/* One white sheet on the canvas (ADR-131): pages draw lines and bordered cards on it. */}
        <div className="lg:border-border lg:bg-card px-4 pt-10 sm:px-8 lg:min-h-[calc(100dvh-2rem)] lg:rounded-(--shape-sheet) lg:border lg:px-12">
          <div className="mx-auto max-w-5xl">
            {/* The header paints at once and each page draws its own frame, with a skeleton on
                the values it still reads (ADR-110): nothing waits here but the address. */}
            <Suspense fallback={null}>
              <CarnetHeading>{children}</CarnetHeading>
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
