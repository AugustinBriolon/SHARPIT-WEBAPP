/** The week's load against the week before, as a signed share; null without a week before. */
export function loadChange(stats: { totalLoad: number; prevTotalLoad: number }): string | null {
  if (stats.prevTotalLoad <= 0) {
    return null;
  }
  const change = Math.round(((stats.totalLoad - stats.prevTotalLoad) / stats.prevTotalLoad) * 100);
  return `${change > 0 ? '+' : ''}${change} % sur la semaine d’avant`;
}
