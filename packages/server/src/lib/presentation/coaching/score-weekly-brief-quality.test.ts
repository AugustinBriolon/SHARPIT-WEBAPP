import { describe, expect, it } from 'vitest';
import type { WeeklyCoachingBriefViewModel } from '@sharpit/app/presentation/weekly-coaching-brief-view-model';
import { scoreWeeklyBriefQuality } from './score-weekly-brief-quality';

function baseVm(
  overrides: Partial<WeeklyCoachingBriefViewModel> = {},
): WeeklyCoachingBriefViewModel {
  return {
    weekStartLabel: 'lun. 6 oct.',
    weekEndLabel: 'dim. 12 oct.',
    visible: true,
    planContext: {
      phaseLabel: 'Build',
      targetLoad: 400,
      isDeload: false,
      focus: 'Seuil',
    },
    goalContext: {
      title: 'Semi',
      targetDateLabel: '1 nov. 2026',
      daysToGo: 26,
      horizonLabel: 'Course',
    },
    load: { plannedLoad: 380, toleratedCeiling: 440, toleratedSource: 'PLAN_TARGET' },
    keySessions: [
      {
        sessionId: 's1',
        dateLabel: 'mer. 8',
        typeLabel: 'Course',
        intensityLabel: 'Seuil',
        purpose: null,
        goalTitle: null,
      },
    ],
    recovery: { protectedDayLabels: ['dimanche'], note: '1 jour protégé' },
    limitingFactor: {
      limitingFactorLabel: 'Récupération',
      confidenceTierLabel: 'Élevée',
      asOfLabel: 'Situation au 6 oct.',
    },
    assumptions: [],
    dataGaps: [],
    whatWouldChange: [],
    learningFeedback: [{ key: 'k', sentence: 'Pattern observé.' }],
    emptyState: null,
    ...overrides,
  };
}

describe('scoreWeeklyBriefQuality', () => {
  it('scores a complete brief at 100 with no flags', () => {
    expect(scoreWeeklyBriefQuality(baseVm())).toEqual({ score: 100, flags: [] });
  });

  it('deducts for missing plan week and key sessions', () => {
    const result = scoreWeeklyBriefQuality(baseVm({ planContext: null, keySessions: [] }));
    expect(result.flags).toEqual(expect.arrayContaining(['missing_plan_week', 'no_key_sessions']));
    expect(result.score).toBe(65);
  });

  it('caps empty-state briefs at 25', () => {
    const result = scoreWeeklyBriefQuality(
      baseVm({
        planContext: null,
        goalContext: null,
        load: null,
        keySessions: [],
        recovery: null,
        limitingFactor: null,
        learningFeedback: [],
        emptyState: {
          title: 'Pas de plan',
          description: 'Génère un plan.',
          action: { label: 'Remplir', href: '/plan' },
        },
      }),
    );
    expect(result.flags).toContain('empty_state');
    expect(result.score).toBeLessThanOrEqual(25);
    expect(result.score).toBe(15);
  });
});
