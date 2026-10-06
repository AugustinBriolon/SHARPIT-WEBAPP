/** The carnet's pages, in the order of its row; Compte closes it. */
export const CARNET_PAGES = [
  { href: '/', label: "Aujourd'hui" },
  { href: '/saison', label: 'La saison' },
  { href: '/bilans', label: 'Les bilans' },
  { href: '/seances', label: 'Les séances' },
  { href: '/records', label: 'Les records' },
  { href: '/corps', label: 'Le corps' },
  { href: '/nutrition', label: 'La nutrition' },
] as const;

export const ACCOUNT_PAGE = { href: '/compte', label: 'Compte' } as const;

export function isCurrentPage(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Where a path sits along the row, so a page can arrive from the side the reader heads. */
export function carnetPageIndex(pathname: string): number {
  const index = CARNET_PAGES.findIndex((page) => isCurrentPage(pathname, page.href));
  return index === -1 ? CARNET_PAGES.length : index;
}

/**
 * Which way the reader heads from one page to the next: 1 toward the right of the row, -1
 * toward the left, 0 deeper into the same page (a session from the list).
 */
export function headingBetween(from: string | null, to: string): -1 | 0 | 1 {
  if (from === null) {
    return 0;
  }
  const a = carnetPageIndex(from);
  const b = carnetPageIndex(to);
  return a === b ? 0 : b > a ? 1 : -1;
}
