import { describe, expect, it } from 'vitest';
import { findFreeSlot } from './google-sync';
import { mergeBusyIntervals } from './merge-busy-intervals';

describe('findFreeSlot with merged Apple busy', () => {
  it('skips slots overlapping uploaded Apple intervals', () => {
    const busy = mergeBusyIntervals([
      { start: '2026-10-10T04:00:00.000Z', end: '2026-10-10T07:00:00.000Z' },
      { start: '2026-10-10T05:30:00.000Z', end: '2026-10-10T06:30:00.000Z' },
    ]);

    expect(findFreeSlot('2026-10-10', 60, busy, 'Europe/Paris')).toBe('09:00');
  });
});
