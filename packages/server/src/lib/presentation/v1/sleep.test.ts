import { describe, expect, it } from 'vitest';
import { projectV1Sleep, type V1SleepSource } from './sleep';

function source(over: Partial<V1SleepSource> = {}): V1SleepSource {
  return {
    nightStatus: 'present',
    sleepScore: 82,
    adequacyDisplay: { label: 'Sommeil suffisant', colorClass: 'text-x' },
    scoreBreakdown: {
      restorativeRatio: 0.42,
      durationScore: 88,
      architectureScore: 74,
      rawScore: 82,
      debtMin: null,
      debtModifier: 0,
      sharpitScore: 82,
    },
    totalSleepMin: 452,
    deepMin: 80,
    remMin: 110,
    lightMin: 240,
    awakeMin: 22,
    bedtimeMin: 1390,
    wakeMin: 422,
    sleepDelta7d: 18,
    targetDeltaMin: -28,
    sleepTargetMin: 480,
    coachView: {
      hasData: true,
      hasDetailedData: true,
      latest: null,
      avg: { score: 76, durationMin: 434, deepPct: 17, remPct: 23, nights: 7 },
      regularityMin: 35,
      recommendedBedtimeMin: 1350,
      recommendedDurationMin: 495,
      targetDurationMin: 480,
      sleepNeededMin: 495,
      sleepNeededContributors: { debtBoostMin: 15, strainBoostMin: 0, efficiencyBoostMin: 0 },
      debt7Min: 96,
      debt14Min: 150,
      insights: [{ tone: 'moderate', title: 'Dette légère', detail: 'Couche-toi plus tôt.' }],
    },
    barData: [
      { date: '19/09', minutes: 420, fill: 'var(--a)' },
      { date: '20/09', minutes: null, fill: 'var(--b)' },
      { date: '21/09', minutes: 452, fill: 'var(--c)' },
    ],
    recoveryNote: null,
    confidencePresentation: { pct: 74, label: null, tone: 'warn' },
    emptyState: null,
    ...over,
  };
}

describe('projectV1Sleep', () => {
  it('dates each night of the window from the training day, oldest first', () => {
    const payload = projectV1Sleep(source(), '2026-09-21');
    expect(payload.history).toEqual([
      { date: '2026-09-19', minutes: 420 },
      { date: '2026-09-20', minutes: null },
      { date: '2026-09-21', minutes: 452 },
    ]);
  });

  it('carries the adequacy key for the tone and drops web-only styling', () => {
    const payload = projectV1Sleep(source(), '2026-09-21');
    expect(payload.adequacy).toEqual({ key: 'ADEQUATE', label: 'Sommeil suffisant' });
    expect(JSON.stringify(payload)).not.toContain('colorClass');
    expect(JSON.stringify(payload)).not.toContain('var(--');
  });

  // Callers: vitest. API: projectV1Sleep windDownStartMin. User: "fix all".
  it('places wind-down 45 minutes before the recommended bedtime', () => {
    const payload = projectV1Sleep(source(), '2026-09-21');
    // 1350 − 45 = 1305 (21:45).
    expect(payload.windDownStartMin).toBe(1305);
    expect(payload.recommendedBedtimeMin).toBe(1350);
  });

  it('reads a pending night as pending, whatever the score says', () => {
    const payload = projectV1Sleep(
      source({ nightStatus: 'pending', sleepScore: null }),
      '2026-09-21',
    );
    expect(payload.adequacy.key).toBe('PENDING');
  });

  it('gives no recommended duration when there is no sleep data at all', () => {
    const empty = source();
    const payload = projectV1Sleep(
      { ...empty, coachView: { ...empty.coachView, hasData: false } },
      '2026-09-21',
    );
    expect(payload.recommendedDurationMin).toBeNull();
  });

  it('turns the empty state into a title and message', () => {
    const payload = projectV1Sleep(
      source({ emptyState: { title: 'Données indisponibles.', description: 'Synchronise.' } }),
      '2026-09-21',
    );
    expect(payload.empty).toEqual({ title: 'Données indisponibles.', message: 'Synchronise.' });
  });
});
