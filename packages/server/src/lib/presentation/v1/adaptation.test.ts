import { describe, expect, it } from 'vitest';
import { projectV1Adaptation, type V1AdaptationSource } from './adaptation';

function source(over: Partial<V1AdaptationSource> = {}): V1AdaptationSource {
  return {
    adaptationIndex: 64,
    statusLabel: 'Consolidation',
    statusClassName: 'text-[var(--color-signal-recovery)]',
    trendLabel: 'En progression',
    verdictLabel: 'Consolider',
    verdictClassName: 'text-[var(--color-signal-recovery)]',
    verdictKey: 'CONSOLIDATE',
    loadMultiplier: 1,
    rationale: ['La VFC suit la charge'],
    keyEvidence: ['Allure en hausse à FC égale'],
    limitingFactor: 'Qualité de récupération',
    plateauRisk: false,
    overreachingWithoutAdaptation: false,
    dimensions: [
      {
        key: 'loadProgression',
        label: 'Progression de charge',
        description: 'La charge évolue-t-elle ?',
        dim: { score: 70, status: 'GOOD', available: true },
      },
      {
        key: 'recoveryQuality',
        label: 'Qualité de récupération',
        description: 'La récupération soutient-elle ?',
        dim: { score: 41, status: 'LOW', available: true },
      },
      {
        key: 'autonomicAdaptation',
        label: 'Adaptation autonome',
        description: 'Le système nerveux suit-il ?',
        dim: { score: 12, status: 'UNKNOWN', available: false },
      },
    ],
    availableDimCount: 2,
    historyLength: 42,
    confidencePct: 61,
    confidenceTone: 'warn',
    emptyState: null,
    ...over,
  };
}

describe('projectV1Adaptation', () => {
  it('marks the limiting dimension and hides a missing score', () => {
    const response = projectV1Adaptation(source(), '2026-10-04');
    expect(response.dimensions.find((d) => d.isLimiting)?.key).toBe('recoveryQuality');
    expect(response.dimensions[2]).toMatchObject({ available: false, score: null });
  });

  it('turns the web classes into tones', () => {
    const response = projectV1Adaptation(source(), '2026-10-04');
    expect(response.status).toEqual({ label: 'Consolidation', tone: 'good' });
    expect(response.verdict).toEqual({ key: 'CONSOLIDATE', label: 'Consolider', tone: 'good' });
  });

  it('claims no confidence while it is empty', () => {
    const response = projectV1Adaptation(
      source({ emptyState: { title: 'Adaptation en cours de consolidation' } }),
      '2026-10-04',
    );
    expect(response.empty).toEqual({
      title: 'Adaptation en cours de consolidation',
      message: null,
    });
    expect(response.confidencePct).toBeNull();
  });
});
