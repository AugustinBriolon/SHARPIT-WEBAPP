import { describe, expect, it } from 'vitest';
import { projectV1Recovery, toneFromClass, type V1RecoverySource } from './recovery';

function source(over: Partial<V1RecoverySource> = {}): V1RecoverySource {
  return {
    readinessScore: 71,
    signal: { label: 'Bonne', qualityClass: 'text-[var(--color-signal-recovery)]', arrow: '↗' },
    limiterLabel: 'Sommeil court',
    limiterSignal: 'sleep_short',
    estimatedRecoveryDays: 1,
    isCalibrating: false,
    availableDimCount: 3,
    dimensions: {
      autonomic: { score: 78, status: 'NORMAL', available: true },
      sleep: { score: 58, status: 'INSUFFICIENT', available: true },
      subjective: { score: null, status: 'UNKNOWN', available: false },
      loadContext: { score: 70, status: 'OPTIMAL', available: true },
    },
    intensityLabel: 'Modérée',
    rationale: ['VFC dans la norme'],
    autonomicLabel: 'Équilibre normal',
    autonomicClass: 'text-[var(--color-signal-recovery)]',
    wellnessLabel: 'Bien-être faible',
    wellnessClass: 'text-signal-caution',
    loadLabel: 'Charge optimale',
    loadClass: 'text-primary',
    dissonanceDetected: false,
    sparkHrv: [
      { date: '20 sept.', value: 62 },
      { date: '21 sept.', value: 58 },
    ],
    sparkRhr: [
      { date: '20 sept.', value: 48 },
      { date: '21 sept.', value: null },
    ],
    dualData: [],
    baselineLow: 55,
    baselineHigh: 70,
    hrv: 58,
    restingHr: 49,
    bodyBattery: 72,
    confidencePct: 68,
    confidenceTone: 'warn',
    completenessLabel: 'Partielles',
    overreaching: { label: 'Risque modéré', colorClass: 'text-signal-caution' },
    illness: undefined,
    keyEvidence: ['Sommeil sous la cible deux nuits de suite'],
    emptyState: null,
    ...over,
  };
}

describe('toneFromClass', () => {
  it('reads the signal token a class names', () => {
    expect(toneFromClass('text-signal-risk')).toBe('risk');
    expect(toneFromClass('text-signal-vo2')).toBe('elevated');
    expect(toneFromClass('text-[var(--color-signal-recovery)]')).toBe('good');
    expect(toneFromClass('text-primary')).toBe('strong');
    expect(toneFromClass('text-muted-foreground')).toBe('neutral');
    expect(toneFromClass(undefined)).toBe('neutral');
  });
});

describe('projectV1Recovery', () => {
  it('keeps only the dimensions that were measured, in a stable order', () => {
    const payload = projectV1Recovery(source(), '2026-09-21');
    expect(payload.dimensions.map((d) => d.key)).toEqual(['autonomic', 'sleep', 'loadContext']);
  });

  it('merges the HRV and resting HR series into dated days', () => {
    const payload = projectV1Recovery(source(), '2026-09-21');
    expect(payload.history).toEqual([
      { date: '2026-09-20', hrv: 62, restingHr: 48 },
      { date: '2026-09-21', hrv: 58, restingHr: null },
    ]);
  });

  it('turns risks into alerts with tones and ships no web classes', () => {
    const payload = projectV1Recovery(source(), '2026-09-21');
    expect(payload.alerts).toEqual([
      { key: 'overreaching', label: 'Risque modéré', tone: 'caution' },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/text-|var\(--/);
  });

  it('gives no confidence for an empty day', () => {
    const payload = projectV1Recovery(
      source({ emptyState: { title: 'Indisponible.', description: 'Réessaie.' } }),
      '2026-09-21',
    );
    expect(payload.empty).toEqual({ title: 'Indisponible.', message: 'Réessaie.' });
    expect(payload.confidencePct).toBeNull();
  });
});
