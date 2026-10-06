'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { cn } from '@sharpit/app/lib/utils';
import { ACCOUNT_PAGE, CARNET_PAGES, isCurrentPage } from './carnet-pages';

/**
 * The row of pages. The mark under the current page glides to the next one (a shared
 * Motion layout), and on a phone the row scrolls the current page into view.
 */
export function CarnetNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const current = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [pathname]);

  return (
    <nav aria-label="Carnet" className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1" ref={listRef}>
        {CARNET_PAGES.map((page) => {
          const current = isCurrentPage(pathname, page.href);
          return (
            <li key={page.href}>
              <Link
                aria-current={current ? 'page' : undefined}
                href={page.href}
                className={cn(
                  'relative block rounded-md px-3 py-1.5 text-sm transition-[color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100',
                  current
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {current ? (
                  <motion.span
                    aria-hidden
                    className="bg-highlight absolute inset-0 rounded-md"
                    layoutId="carnet-nav-current"
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
  const pathname = usePathname();
  const current = isCurrentPage(pathname, ACCOUNT_PAGE.href);
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
