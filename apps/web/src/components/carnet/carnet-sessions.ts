import type { ActivityType } from '@prisma/client';
import { monthLabel } from './carnet-time';

/** What the session list reads of `/api/v1/activities`. */
export type SessionListItem = {
  id: string;
  type: ActivityType;
  date: Date;
  title: string | null;
  duration: number | null;
  load: number | null;
  runMetrics: { distanceM: number | null } | null;
  bikeMetrics: { distanceM: number | null } | null;
  swimMetrics: { distanceM: number | null } | null;
  hikeMetrics: { distanceM: number | null } | null;
};

export function sessionDistanceM(item: SessionListItem): number | null {
  return (
    item.runMetrics?.distanceM ??
    item.bikeMetrics?.distanceM ??
    item.swimMetrics?.distanceM ??
    item.hikeMetrics?.distanceM ??
    null
  );
}

export type SessionMonth = {
  key: string;
  label: string;
  items: SessionListItem[];
  durationSec: number;
  load: number;
};

/** Newest month first, newest session first inside it, with the month's totals. */
export function sessionsByMonth(items: readonly SessionListItem[]): SessionMonth[] {
  const months = new Map<string, SessionMonth>();
  const sorted = [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const item of sorted) {
    const key = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
    let month = months.get(key);
    if (!month) {
      month = { key, label: monthLabel(item.date), items: [], durationSec: 0, load: 0 };
      months.set(key, month);
    }
    month.items.push(item);
    month.durationSec += item.duration ?? 0;
    month.load += item.load ?? 0;
  }
  return [...months.values()];
}

/** The sports present, most practised first — the filters the list offers. */
export function sportsByFrequency(items: readonly SessionListItem[]): ActivityType[] {
  const counts = new Map<ActivityType, number>();
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([type]) => type);
}
