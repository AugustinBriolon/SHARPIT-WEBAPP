'use client';

import { usePathname } from 'next/navigation';
import { ACCOUNT_PAGE, CARNET_PAGES, isCurrentPage } from './carnet-pages';

function pageLabel(pathname: string): string {
  if (isCurrentPage(pathname, ACCOUNT_PAGE.href)) {
    return ACCOUNT_PAGE.label;
  }
  return CARNET_PAGES.find((page) => isCurrentPage(pathname, page.href))?.label ?? '';
}

/**
 * What a page shows while it reads: its name already in place, then the title's and three
 * sections' places, in the page's own grammar so nothing jumps when the reading arrives.
 * A navigation the App Shell already carries never shows it.
 */
export function CarnetPageSkeleton() {
  return <CarnetSkeletonFrame label={pageLabel(usePathname())} />;
}

/** The skeleton for a known page name, or nameless before the address is read. */
export function CarnetSkeletonFrame({ label }: { label: string }) {
  return (
    <div className="space-y-12 pb-24" role="status" aria-busy>
      <span className="sr-only">Chargement</span>
      <div className="space-y-2">
        <p className="text-label text-muted-foreground h-4">{label}</p>
        <div className="bg-muted h-9 w-2/3 animate-pulse rounded motion-reduce:animate-none sm:h-10" />
        <div className="bg-muted mt-3 h-4 w-1/2 animate-pulse rounded motion-reduce:animate-none" />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="border-border/70 border-t pt-6">
          <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
            <div className="bg-muted h-3 w-24 animate-pulse rounded motion-reduce:animate-none" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {[0, 1, 2, 3].map((cell) => (
                <div key={cell} className="space-y-2">
                  <div className="bg-muted h-3 w-16 animate-pulse rounded motion-reduce:animate-none" />
                  <div className="bg-muted h-7 w-20 animate-pulse rounded motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
