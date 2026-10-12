import { describe, expect, it } from 'vitest';
import {
  formatCompareSleepVsReadinessMarkdown,
  formatExplainDayScoresMarkdown,
  formatExplainTargetBandMarkdown,
} from './coach-insights-format';
import type { V1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';

const SCORES: V1DayScores = {
  stress: { value: 55, asOf: '2026-10-12' },
  energyBank: {
    algorithmVersion: 'v1',
    value: 64,
    typicalBaseline: 70,
    asOfMinuteOfDay: 600,
    series: [],
  },
  targetBand: { algorithmVersion: 'v1', low: 7, high: 11, status: 'within' },
};

describe('formatExplainDayScoresMarkdown', () => {
  it('names réserve, stress and cible without medical claims', () => {
    const md = formatExplainDayScoresMarkdown({
      trainingDayId: '2026-10-12',
      scores: SCORES,
      readiness: 72,
    });
    expect(md).toContain("Réserve d'énergie");
    expect(md).toContain('64/100');
    expect(md).toContain('Stress');
    expect(md).toContain("Cible d'effort");
    expect(md).toContain('pas un diagnostic médical');
  });
});

describe('formatExplainTargetBandMarkdown', () => {
  it('explains the band window', () => {
    const md = formatExplainTargetBandMarkdown({
      trainingDayId: '2026-10-12',
      band: SCORES.targetBand!,
      readiness: 72,
    });
    expect(md).toContain('7–11');
    expect(md).toContain('dans la cible');
  });
});

describe('formatCompareSleepVsReadinessMarkdown', () => {
  it('builds a compact table', () => {
    const md = formatCompareSleepVsReadinessMarkdown(
      [
        { trainingDayId: '2026-10-10', sleepMinutes: 420, readiness: 68 },
        { trainingDayId: '2026-10-11', sleepMinutes: 360, readiness: 48 },
        { trainingDayId: '2026-10-12', sleepMinutes: 450, readiness: 75 },
      ],
      7,
    );
    expect(md).toContain('| Jour | Sommeil | Forme |');
    expect(md).toContain('2026-10-11');
    expect(md).toContain('nuit(s) courte(s)');
  });

  it('handles empty windows', () => {
    expect(formatCompareSleepVsReadinessMarkdown([], 7)).toContain('Pas assez');
  });
});
