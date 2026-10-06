'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@sharpit/app/lib/utils';

export const CARNET_PAGES = [
  { href: '/carnet', label: "Aujourd'hui" },
  { href: '/carnet/saison', label: 'La saison' },
  { href: '/carnet/bilans', label: 'Les bilans' },
  { href: '/carnet/seances', label: 'Les séances' },
  { href: '/carnet/records', label: 'Les records' },
  { href: '/carnet/corps', label: 'Le corps' },
  { href: '/carnet/nutrition', label: 'La nutrition' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === '/carnet' ? pathname === href : pathname.startsWith(href);
}

export function CarnetNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Carnet" className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1">
        {CARNET_PAGES.map((page) => {
          const current = isCurrent(pathname, page.href);
          return (
            <li key={page.href}>
              <Link
                aria-current={current ? 'page' : undefined}
                href={page.href}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm transition-colors',
                  current
                    ? 'bg-highlight text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {page.label}
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
  const current = pathname.startsWith('/carnet/compte');
  return (
    <Link
      aria-current={current ? 'page' : undefined}
      href="/carnet/compte"
      className={cn(
        'text-sm transition-colors',
        current ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      Compte
    </Link>
  );
}
