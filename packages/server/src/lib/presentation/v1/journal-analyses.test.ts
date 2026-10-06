import { describe, expect, it } from 'vitest';
import type { JournalHabitFinding } from '@sharpit/app/lib/journal/journal-habit-analysis';
import { projectV1JournalAnalyses } from './journal-analyses';

function finding(over: Partial<JournalHabitFinding> = {}): JournalHabitFinding {
  return {
    kind: 'effect',
    factorId: 'alcohol',
    outcome: 'sleepMinutes',
    nYes: 7,
    nNo: 22,
    medianYes: 372,
    medianNo: 424,
    yesValues: [350, 372, 380, 360, 430, 365, 390],
    noValues: [424, 410, 440, 430, 400],
    absDelta: 52,
    polarity: 'minus',
    confidence: 'high',
    lagDays: 1,
    ...over,
  };
}

describe('projectV1JournalAnalyses', () => {
  it('stays closed until enough days carry a signal', () => {
    const payload = projectV1JournalAnalyses({
      minDays: 7,
      daysWithSignal: 4,
      daysInSpan: 5,
      findings: [finding()],
    });
    expect(payload).toEqual({
      apiVersion: 1,
      minDays: 7,
      daysWithSignal: 4,
      daysInSpan: 5,
      reading: null,
      lifts: [],
      drags: [],
      leads: [],
    });
  });

  it('sorts net associations into drags and lifts, and weak ones into leads', () => {
    const payload = projectV1JournalAnalyses({
      minDays: 7,
      daysWithSignal: 29,
      daysInSpan: 30,
      findings: [
        finding(),
        finding({
          factorId: 'yoga',
          polarity: 'plus',
          medianYes: 460,
          medianNo: 420,
          absDelta: 40,
          lagDays: 0,
        }),
        finding({ factorId: 'late_meal', confidence: 'medium', lagDays: 0 }),
      ],
    });

    expect(payload.reading?.verdict).toContain('«');
    expect(payload.drags).toHaveLength(1);
    expect(payload.drags[0]).toMatchObject({ outcome: 'sleepMinutes', title: 'Sommeil' });
    expect(payload.drags[0]!.rows[0]).toMatchObject({ weak: false, nYes: 7, nNo: 22 });
    expect(payload.drags[0]!.rows[0]!.withPct).toBeLessThan(payload.drags[0]!.rows[0]!.withoutPct);
    expect(payload.lifts[0]!.rows[0]!.withPct).toBeGreaterThan(
      payload.lifts[0]!.rows[0]!.withoutPct,
    );
    expect(payload.leads[0]!.rows[0]!.weak).toBe(true);
    expect(payload.drags[0]!.ticks.map((tick) => Math.round(tick.pct))).toEqual([0, 33, 67, 100]);
  });
});
