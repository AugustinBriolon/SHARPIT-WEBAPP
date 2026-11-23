/**
 * The carnet's destinations, one per time horizon (ADR-144): now, the week, the long run, the
 * body. A destination opens on its first page; the others sit in a row above the page.
 */
export const CARNET_DESTINATIONS = [
  { label: "Aujourd'hui", pages: [{ href: '/', label: "Aujourd'hui" }] },
  {
    label: 'Semaine',
    pages: [
      { href: '/saison', label: 'Saison' },
      { href: '/bilans', label: 'Bilans' },
    ],
  },
  {
    label: 'Progrès',
    pages: [
      { href: '/seances', label: 'Séances' },
      { href: '/records', label: 'Records' },
    ],
  },
  {
    label: 'Corps',
    pages: [
      { href: '/corps', label: 'Santé' },
      { href: '/nutrition', label: 'Nutrition' },
    ],
  },
] as const;

export type CarnetDestination = (typeof CARNET_DESTINATIONS)[number];

/** Every page in the order of the rail; Compte closes it. */
export const CARNET_PAGES = CARNET_DESTINATIONS.flatMap((destination) => [...destination.pages]);

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

/** The destination a path belongs to, or none (Compte, an unknown path). */
export function destinationOf(pathname: string): CarnetDestination | null {
  return (
    CARNET_DESTINATIONS.find((destination) =>
      destination.pages.some((page) => isCurrentPage(pathname, page.href)),
    ) ?? null
  );
}
