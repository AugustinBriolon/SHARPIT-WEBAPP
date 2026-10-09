'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { cn } from '@sharpit/app/lib/utils';
import { springs } from '@/client/motion/tokens';
import { prefersReducedMotion } from './carnet-motion';
import { ACCOUNT_PAGE, CARNET_PAGES, isCurrentPage } from './carnet-pages';

/**
 * The row of pages. The mark under the current page glides to the next one (a shared
 * Motion layout), and on a phone the row scrolls the current page into view.
 */
export function CarnetNav() {
  return <CarnetNavRow pathname={usePathname()} />;
}

/**
 * The row for a known path, or with no page marked (`null`): what a session's page shows
 * before its address is read, since a session's id is only known at request time.
 */
export function CarnetNavRow({ pathname }: { pathname: string | null }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const current = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [pathname]);

  return (
    <nav aria-label="Carnet" className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ul ref={listRef} className="flex min-w-max gap-1">
        {CARNET_PAGES.map((page) => {
          const current = pathname !== null && isCurrentPage(pathname, page.href);
          return (
            <li key={page.href}>
              <Link
                aria-current={current ? 'page' : undefined}
                href={page.href}
                // Les séances reads its filters from the address, which the App Shell cannot
                // carry: this one tab is prefetched with them resolved (runtime prefetch).
                prefetch={page.href === '/seances' ? true : undefined}
                className={cn(
                  'relative block rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
                  current
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {current ? (
                  <motion.span
                    className="bg-highlight absolute inset-0 rounded-md"
                    layoutId="carnet-nav-current"
                    transition={springs.snappy}
                    aria-hidden
                  />
                ) : null}
                <span className="relative">{page.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function CarnetAccountLink() {
  return <CarnetAccountLinkFor pathname={usePathname()} />;
}

export function CarnetAccountLinkFor({ pathname }: { pathname: string | null }) {
  const current = pathname !== null && isCurrentPage(pathname, ACCOUNT_PAGE.href);
  return (
    <Link
      aria-current={current ? 'page' : undefined}
      href={ACCOUNT_PAGE.href}
      className={cn(
        'text-sm transition-colors',
        current ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {ACCOUNT_PAGE.label}
    </Link>
  );
}
