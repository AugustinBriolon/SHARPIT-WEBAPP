import { describe, expect, it } from 'vitest';
import { mergeBusyIntervals } from './merge-busy-intervals';

describe('mergeBusyIntervals', () => {
  it('merges overlapping intervals', () => {
    const merged = mergeBusyIntervals([
      { start: '2026-10-10T09:00:00.000Z', end: '2026-10-10T10:00:00.000Z' },
      { start: '2026-10-10T09:30:00.000Z', end: '2026-10-10T11:00:00.000Z' },
    ]);
    expect(merged).toEqual([
      { start: '2026-10-10T09:00:00.000Z', end: '2026-10-10T11:00:00.000Z' },
    ]);
  });

  it('keeps disjoint intervals sorted', () => {
    const merged = mergeBusyIntervals([
      { start: '2026-10-10T14:00:00.000Z', end: '2026-10-10T15:00:00.000Z' },
      { start: '2026-10-10T09:00:00.000Z', end: '2026-10-10T10:00:00.000Z' },
    ]);
    expect(merged).toEqual([
      { start: '2026-10-10T09:00:00.000Z', end: '2026-10-10T10:00:00.000Z' },
      { start: '2026-10-10T14:00:00.000Z', end: '2026-10-10T15:00:00.000Z' },
    ]);
  });
});
