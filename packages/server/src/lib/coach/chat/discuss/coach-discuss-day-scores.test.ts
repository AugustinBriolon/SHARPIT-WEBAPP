import { describe, expect, it } from 'vitest';
import {
  formatDayScoresDiscussLines,
  formatDayScoresPushBits,
  formatMorningBriefDiscussBlock,
  formatTodayDiscussDataBlock,
} from './coach-discuss-day-scores';
import type { V1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';

const SCORES: V1DayScores = {
  stress: { value: 42, asOf: '2026-10-12' },
  energyBank: {
    algorithmVersion: 'v1',
    value: 71,
    typicalBaseline: 65,
    asOfMinuteOfDay: 480,
    series: [],
  },
  targetBand: {
    algorithmVersion: 'v1',
    low: 8,
    high: 12,
    status: 'within',
  },
};

describe('formatDayScoresPushBits', () => {
  it('prefers réserve and stress for the lock screen', () => {
    expect(formatDayScoresPushBits(SCORES)).toBe('Réserve 71 · Stress 42');
  });

  it('falls back to cible when energy/stress are missing', () => {
    expect(
      formatDayScoresPushBits({
        stress: null,
        energyBank: null,
        targetBand: SCORES.targetBand,
      }),
    ).toBe('Cible 8–12');
  });

  it('returns null when nothing is available', () => {
    expect(
      formatDayScoresPushBits({ stress: null, energyBank: null, targetBand: null }),
    ).toBeNull();
  });
});

describe('formatMorningBriefDiscussBlock', () => {
  it('names verdict, day scores, session and proposal', () => {
    const block = formatMorningBriefDiscussBlock({
      trainingDayId: '2026-10-12',
      verdictLabel: 'Entraîne-toi fort',
      scores: SCORES,
      readiness: 78,
      sessionLine: 'Seuil · 55 min',
      proposalLine: 'Ta nuit invite à lever le pied : Endurance → Récupération',
      productMessage: 'Bonne forme ce matin.',
    });

    expect(block).toContain('## Conversation ouverte depuis le brief du matin');
    expect(block).toContain('Entraîne-toi fort');
    expect(block).toContain("Réserve d'énergie : 71/100");
    expect(block).toContain('Stress : 42/100');
    expect(block).toContain("Cible d'effort : 8–12");
    expect(block).toContain('Seuil · 55 min');
    expect(block).toContain('Proposition matin');
  });
});

describe('formatDayScoresDiscussLines', () => {
  it('includes sleep needed when provided', () => {
    const lines = formatDayScoresDiscussLines({
      scores: SCORES,
      readiness: 80,
      sleepNeededMin: 495,
    }).filter(Boolean);

    expect(lines.some((l) => String(l).includes('Sommeil nécessaire'))).toBe(true);
    expect(lines.some((l) => String(l).includes('Forme : 80'))).toBe(true);
  });
});

describe('formatTodayDiscussDataBlock', () => {
  it('embeds ADR-079 scores for the Today discuss chip', () => {
    const block = formatTodayDiscussDataBlock({
      trainingDayId: '2026-10-12',
      scores: SCORES,
      readiness: 80,
      sleepNeededMin: 495,
      sessionLine: 'Endurance · 45 min',
    });
    expect(block).toContain("## Conversation ouverte depuis Aujourd'hui");
    expect(block).toContain("Réserve d'énergie : 71/100");
    expect(block).toContain('Sommeil nécessaire');
    expect(block).toContain('Endurance · 45 min');
  });
});
