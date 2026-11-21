import { describe, expect, it } from 'vitest';
import {
  countDaysInSpan,
  dayIdsInPeriods,
} from '@sharpit/server/lib/journal/journal-habit-analysis-load';
import type { JournalAnalysisDay } from '@sharpit/app/lib/journal/journal-habit-analysis';

function day(trainingDayId: string): JournalAnalysisDay {
  return { trainingDayId, factors: {}, sleepMinutes: null, recoveryScore: null, bodyBattery: null };
}

describe('countDaysInSpan', () => {
  it('counts calendar days between the first and last signalled day', () => {
    expect(countDaysInSpan([day('2026-08-01'), day('2026-08-03'), day('2026-08-10')])).toBe(10);
  });

  it('is zero with no signal and one for a single day', () => {
    expect(countDaysInSpan([])).toBe(0);
    expect(countDaysInSpan([day('2026-08-01')])).toBe(1);
  });
});

describe('dayIdsInPeriods', () => {
  it('lists every day of a trip, both ends included', () => {
    const ids = dayIdsInPeriods([
      { start: new Date('2026-10-30T00:00:00Z'), end: new Date('2026-11-01T00:00:00Z') },
    ]);
    expect([...ids]).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('drops a period that runs backwards or that lasts for months', () => {
    expect(
      dayIdsInPeriods([
        { start: new Date('2026-11-02T00:00:00Z'), end: new Date('2026-11-01T00:00:00Z') },
        { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-11-01T00:00:00Z') },
      ]).size,
    ).toBe(0);
  });
});
