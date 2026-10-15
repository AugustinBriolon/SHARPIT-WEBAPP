import { ActivityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { LIMITER_SIGNAL_CODES } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import { projectV1Today, type V1TodayResponse, type V1TodaySource } from './today';

/**
 * Verdict keys + nullability as shipped to TestFlight before `limiterSignal`.
 * Additive fields may appear; these must stay present with the same nullability.
 */
const LEGACY_VERDICT_SHAPE = {
  eyebrow: 'string',
  headline: 'string',
  subline: 'string',
  posture: 'string',
  confidencePct: 'number|null',
  limitingCause: 'string|null',
  statusLabel: 'string',
  actionLine: 'string|null',
  confidenceLabel: 'string|null',
  packTier: 'string|null',
  estimationGaps: 'array',
} as const;

/** Fixture matching main’s `today.test.ts` projection before the frein-code field. */
function legacyTodaySource(): V1TodaySource {
  return {
    hasContent: true,
    emptyState: null,
    hero: {
      eyebrow: 'Ce matin',
      headline: 'Séance prévue',
      subline: 'Tenir',
      posture: 'steady',
      postureLabel: 'FEU VERT',
      focusPriority: 'Entraîne-toi — légèrement',
      actionLine: null,
      twinTrustStrip: {
        confidencePctRounded: 72,
        limitingCauseText: 'Sommeil',
        confidenceLabel: 'ESTIMATION PARTIELLE',
        // Old builds never sent this; projection may omit or set it.
        limiterSignal: null,
      },
      reliability: {
        packTier: 'PARTIAL',
        visibleGaps: ['Baseline HRV partielle (moins de 14 j)'],
      },
      signalPreviews: [
        { key: 'sleep', scoreDisplay: '78', subtitle: 'Correct' },
        { key: 'recovery', scoreDisplay: '61', subtitle: null },
        { key: 'effort', scoreDisplay: '—', subtitle: null },
        { key: 'adaptation', scoreDisplay: '55', subtitle: null },
      ],
    },
    header: { weather: { city: 'Lyon', tempC: 12, condition: 'Nuageux' } },
    actionRow: {
      daySummaryLines: [
        {
          id: 's1',
          kind: 'planned',
          primary: 'Seuil 40 min',
          secondary: 'Course',
          activityType: ActivityType.RUN,
          metrics: [{ label: 'Durée', value: '40', unit: 'min' }],
        },
      ],
    },
  };
}

function assertLegacyVerdictShape(verdict: V1TodayResponse['verdict']) {
  for (const key of Object.keys(LEGACY_VERDICT_SHAPE) as Array<keyof typeof LEGACY_VERDICT_SHAPE>) {
    expect(verdict, `missing legacy key ${key}`).toHaveProperty(key);
  }
  expect(typeof verdict.eyebrow).toBe('string');
  expect(typeof verdict.headline).toBe('string');
  expect(typeof verdict.subline).toBe('string');
  expect(typeof verdict.posture).toBe('string');
  expect(typeof verdict.statusLabel).toBe('string');
  expect(verdict.confidencePct === null || typeof verdict.confidencePct === 'number').toBe(true);
  expect(verdict.limitingCause === null || typeof verdict.limitingCause === 'string').toBe(true);
  expect(verdict.actionLine === null || typeof verdict.actionLine === 'string').toBe(true);
  expect(verdict.confidenceLabel === null || typeof verdict.confidenceLabel === 'string').toBe(
    true,
  );
  expect(verdict.packTier === null || typeof verdict.packTier === 'string').toBe(true);
  expect(Array.isArray(verdict.estimationGaps)).toBe(true);
}

describe('V1 Today backward compatibility (TestFlight)', () => {
  it('keeps every legacy verdict field; limiterSignal is additive code-only', () => {
    const json = projectV1Today(legacyTodaySource(), {
      trainingDayId: '2026-09-15',
      webOrigin: 'https://app.example',
    });

    assertLegacyVerdictShape(json.verdict);

    // Old fixture values remain meaningful (no renamed keys, no placeholders).
    expect(json.verdict).toMatchObject({
      eyebrow: 'Ce matin',
      headline: 'Séance prévue',
      subline: 'Tenir',
      posture: 'steady',
      confidencePct: 72,
      limitingCause: 'Sommeil',
      statusLabel: 'FEU VERT',
      actionLine: 'Entraîne-toi — légèrement',
      confidenceLabel: 'ESTIMATION PARTIELLE',
      packTier: 'PARTIAL',
      estimationGaps: ['Baseline HRV partielle (moins de 14 j)'],
    });
    expect(JSON.stringify(json.verdict)).not.toMatch(/\{[A-Za-z_][A-Za-z0-9_]*\}/);

    // Additive only — code, never a localized chip string.
    expect(json.verdict).toHaveProperty('limiterSignal');
    expect(json.verdict.limiterSignal).toBeNull();
  });

  it('never puts a localized Frein chip string in limiterSignal', () => {
    const source = legacyTodaySource();
    source.hero.twinTrustStrip.limitingCauseText = 'VFC basse';
    source.hero.twinTrustStrip.limiterSignal = 'hrv_low';

    const json = projectV1Today(source, {
      trainingDayId: '2026-09-15',
      webOrigin: 'https://app.example',
    });

    expect(json.verdict.limitingCause).toBe('VFC basse');
    expect(json.verdict.limiterSignal).toBe('hrv_low');
    expect(LIMITER_SIGNAL_CODES).toContain(json.verdict.limiterSignal);
    expect(json.verdict.limiterSignal).not.toMatch(/Frein|VFC|sommeil|résenti|charge/i);
  });
});
