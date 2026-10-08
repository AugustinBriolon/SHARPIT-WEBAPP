import type { BusyInterval } from '@sharpit/server/lib/integrations/google/google';

/** Unions overlapping busy ranges so free-slot search and coach summaries stay consistent. */
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const merged: BusyInterval[] = [];
  let current = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]!;
    if (new Date(next.start).getTime() <= new Date(current.end).getTime()) {
      if (new Date(next.end).getTime() > new Date(current.end).getTime()) {
        current = { ...current, end: next.end };
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}
