import { describe, expect, it } from 'vitest';
import { projectV1Effort, type V1EffortSource } from './effort';

function source(over: Partial<V1EffortSource> = {}): V1EffortSource {
  return {
    strainScore: 12.4,
    dailyLoad: 84,
    weeklyLoad: 420,
    strainComposition: {
      available: true,
      dominantKey: 'training',
      contributors: [],
      signals: { steps: 8400, stress: 31, bodyBattery: 55 },
    },
    fatigueType: 'LOAD_DOMINANT',
    fatigueTypeLabel: 'Charge dominante',
    performancePercent: 92,
    consecutiveDays: 3,
    estimatedDaysToFresh: 2,
    acwr: 1.21,
    chronicWeeklyAvg: 380,
    tsb: -14,
    confidencePct: 74,
    confidenceTone: 'good',
    verdict: 'Maintenir',
    verdictClass: 'text-[var(--color-signal-recovery)]',
    verdictKey: 'MAINTAIN',
    rationale: ['Charge aiguë au-dessus de la chronique'],
    trainingCapacity: 'REDUCED',
    strainSubtitle: 'Séance intense ce matin',
    strainStatusLabel: 'Charge élevée',
    strainStatusClassName: 'text-signal-vo2',
    strainStrokeColor: '#000',
    dimensions: {
      load: { score: 62, status: 'HIGH', available: true },
      metabolic: { score: 10, status: 'LOW', available: true },
      psychological: { score: null, status: 'UNKNOWN', available: false },
    },
    missingDimCount: 2,
    dominantDimension: 'load',
    primaryLimitingFactor: 'Charge',
    isLowFatigue: false,
    pmcSeries: [
      { label: '03/10', ctl: 50, atl: 60, tsb: -10 },
      { label: '04/10', ctl: 51, atl: 64, tsb: -13 },
    ],
    weeklyTss: [
      { week: 'S-1', tss: 400 },
      { week: 'Cette sem.', tss: 210 },
    ],
    avgWeeklyTss: 305,
    overreaching: { label: 'Risque modéré', colorClass: 'text-signal-caution' },
    keyEvidence: ['Trois jours consécutifs de charge'],
    completenessLabel: 'Partielles',
    availableDimCount: 2,
    emptyState: null,
    ...over,
  };
}

describe('projectV1Effort', () => {
  it('lists every fatigue dimension in the web order, missing ones included', () => {
    const response = projectV1Effort(source(), '2026-10-04');
    expect(response.dimensions.map((d) => d.key)).toEqual([
      'load',
      'neuromuscular',
      'metabolic',
      'cumulative',
      'psychological',
    ]);
    expect(response.dimensions[0]).toMatchObject({
      available: true,
      score: 62,
      intensity: 'Élevée',
    });
    expect(response.dimensions[1]).toMatchObject({
      available: false,
      score: null,
      intensity: null,
    });
  });

  it('dates the PMC window so it ends on the training day', () => {
    const response = projectV1Effort(source(), '2026-10-04');
    expect(response.pmc.map((p) => p.date)).toEqual(['2026-10-03', '2026-10-04']);
    expect(response.weeklyTss.at(-1)).toEqual({ label: 'Cette sem.', tss: 210 });
  });

  it('turns the web classes into tones', () => {
    const response = projectV1Effort(source(), '2026-10-04');
    expect(response.strain.tone).toBe('elevated');
    expect(response.verdict.tone).toBe('good');
    expect(response.overreaching).toEqual({ label: 'Risque modéré', tone: 'caution' });
  });

  it('says why it is empty and claims no confidence then', () => {
    const response = projectV1Effort(
      source({
        emptyState: { title: 'Pas encore de charge', description: 'Synchronise une séance.' },
      }),
      '2026-10-04',
    );
    expect(response.empty).toEqual({
      title: 'Pas encore de charge',
      message: 'Synchronise une séance.',
    });
    expect(response.confidencePct).toBeNull();
  });
});
