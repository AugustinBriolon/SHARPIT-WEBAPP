import { describe, expect, it } from 'vitest';
import { thresholdAsOf } from './athlete-context-provider';

const at = (day: string, ftpW: number | null) => ({
  createdAt: new Date(`${day}T10:00:00Z`),
  ftpW,
});
const history = [
  at('2026-08-23', 207),
  at('2026-09-08', null),
  at('2026-10-20', 188),
  at('2026-11-15', 170),
];

describe('thresholdAsOf', () => {
  it('gives the threshold in force on the day, not the latest', () => {
    expect(thresholdAsOf(history, '2026-09-30', 'ftpW')).toBe(207);
    expect(thresholdAsOf(history, '2026-10-20', 'ftpW')).toBe(188);
    expect(thresholdAsOf(history, '2026-11-20', 'ftpW')).toBe(170);
  });

  it('gives the first one known to a day before any was recorded', () => {
    expect(thresholdAsOf(history, '2026-03-01', 'ftpW')).toBe(207);
  });

  it('says nothing when the history never held the value', () => {
    expect(thresholdAsOf(history, '2026-10-01', 'lthr')).toBeUndefined();
  });
});
