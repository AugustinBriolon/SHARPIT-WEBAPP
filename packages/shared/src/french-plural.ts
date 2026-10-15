/**
 * French count + noun agreement — « 1 jour » / « 6 jours ».
 * Singular for 0 and 1; plural from 2 up (matches athlete-facing UI).
 */
export function frenchCount(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

/** « 1 jour » / « N jours » */
export function formatJours(count: number): string {
  return frenchCount(count, 'jour', 'jours');
}

/** « 1 séance » / « N séances » */
export function formatSeances(count: number): string {
  return frenchCount(count, 'séance', 'séances');
}

/**
 * Expand trailing « (s) » after a count already written in the string —
 * e.g. « 6 jour(s) » → « 6 jours », « 1 séance(s) » → « 1 séance ».
 */
export function expandFrenchCountSuffixes(text: string): string {
  return text.replace(/\b(\d+) (\p{L}+)\(s\)/gu, (_, rawCount: string, stem: string) =>
    frenchCount(Number(rawCount), stem, `${stem}s`),
  );
}
