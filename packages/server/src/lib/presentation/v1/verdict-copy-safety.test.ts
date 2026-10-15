import { describe, expect, it } from 'vitest';
import { resolve } from '@sharpit/app/lib/french';
import {
  LIMITER_SIGNAL_BY_DIMENSION,
  LIMITER_SIGNAL_CODES,
  limiterSignalLabel,
  resolveLimiterSignal,
  type LimiterSignalCode,
} from '@sharpit/app/lib/today/dashboard/limiter-signal';
import { projectV1Today, type V1TodaySource } from './today';
import { projectV1Recovery, type V1RecoverySource } from './recovery';

const UNREPLACED_TOKEN = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

/** Count root « récup » ignoring case and accents (récup / RECUP / Récupération…). */
function countRecupRoot(text: string): number {
  const normalized = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return (normalized.match(/recup/g) ?? []).length;
}

function assertNoUnreplacedTokens(value: unknown, path = ''): void {
  if (typeof value === 'string') {
    expect(value, path).not.toMatch(UNREPLACED_TOKEN);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnreplacedTokens(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertNoUnreplacedTokens(child, path ? `${path}.${key}` : key);
    }
  }
}

/** Rendered RECOVER card lines: tag + headline + action + chip (skip empties). */
function recoverCardLines(verdict: {
  statusLabel: string | null;
  headline: string;
  actionLine: string | null;
  limitingCause: string | null;
}): string[] {
  const chipLine = verdict.limitingCause ? `Frein · ${verdict.limitingCause}` : null;
  return [verdict.statusLabel, verdict.headline, verdict.actionLine, chipLine].filter(
    (line): line is string => typeof line === 'string' && line.length > 0,
  );
}

function todayRecoverSource(limiterSignal: LimiterSignalCode): V1TodaySource {
  const label = limiterSignalLabel(limiterSignal);
  return {
    hasContent: true,
    emptyState: null,
    hero: {
      eyebrow: 'Ce matin',
      headline: '', // no separate title for RECOVER
      subline: '',
      posture: 'protect',
      postureLabel: 'Récup d’abord',
      focusPriority: 'Séance légère ou repos aujourd’hui.',
      actionLine: null,
      twinTrustStrip: {
        confidencePctRounded: 70,
        limitingCauseText: label,
        confidenceLabel: null,
        limiterSignal,
      },
      reliability: null,
      signalPreviews: [],
    },
    header: { weather: null },
    actionRow: { daySummaryLines: [] },
  };
}

function recoverySource(code: LimiterSignalCode): V1RecoverySource {
  return {
    readinessScore: 42,
    signal: { label: 'Basse', qualityClass: 'text-signal-caution', arrow: '↓' },
    limiterLabel: limiterSignalLabel(code),
    limiterSignal: code,
    estimatedRecoveryDays: 2,
    isCalibrating: false,
    availableDimCount: 3,
    dimensions: {
      autonomic: { score: 30, status: 'SUPPRESSED', available: true },
      sleep: { score: 55, status: 'ADEQUATE', available: true },
      subjective: { score: 60, status: 'NORMAL', available: true },
      loadContext: { score: 70, status: 'OPTIMAL', available: true },
    },
    intensityLabel: 'Repos',
    rationale: ['Données de récupération lues.'],
    autonomicLabel: 'Supprimé',
    autonomicClass: 'text-signal-caution',
    wellnessLabel: 'Normal',
    wellnessClass: 'text-primary',
    loadLabel: 'Optimale',
    loadClass: 'text-primary',
    dissonanceDetected: false,
    sparkHrv: [],
    sparkRhr: [],
    dualData: [],
    baselineLow: null,
    baselineHigh: null,
    hrv: null,
    restingHr: null,
    bodyBattery: null,
    confidencePct: 70,
    confidenceTone: 'warn',
    completenessLabel: 'Partielles',
    keyEvidence: [],
    emptyState: null,
  };
}

describe('verdict / recovery API copy safety', () => {
  it('RECOVER card: récup once (tag only), no headline, no {token}, every limiter signal', () => {
    for (const code of LIMITER_SIGNAL_CODES) {
      const json = projectV1Today(todayRecoverSource(code), {
        trainingDayId: '2026-09-15',
        webOrigin: 'https://app.example',
      });
      const { verdict } = json;
      assertNoUnreplacedTokens(verdict);

      expect(verdict.statusLabel).toBe('Récup d’abord');
      expect(verdict.headline).toBe('');
      expect(verdict.actionLine).toBe('Séance légère ou repos aujourd’hui.');
      expect(verdict.limiterSignal).toBe(code);
      expect(verdict.limitingCause).toBe(limiterSignalLabel(code));
      expect(verdict.limitingCause).not.toMatch(/récup|système autonome/i);

      const lines = recoverCardLines(verdict);
      expect(lines).toEqual([
        'Récup d’abord',
        'Séance légère ou repos aujourd’hui.',
        `Frein · ${verdict.limitingCause}`,
      ]);

      const recupTotal = lines.reduce((sum, line) => sum + countRecupRoot(line), 0);
      expect(recupTotal, `limiter ${code}: ${lines.join(' | ')}`).toBe(1);
      expect(countRecupRoot(lines[0]!)).toBe(1);
      expect(lines.slice(1).every((line) => countRecupRoot(line) === 0)).toBe(true);

      for (const line of lines) {
        expect(line).not.toMatch(UNREPLACED_TOKEN);
      }
    }
  });

  function hintsForSignal(code: LimiterSignalCode) {
    if (code === 'rhr_high') {
      return {
        hrv: 60,
        hrvBaselineLow: 50,
        hrvBaselineHigh: 70,
        restingHr: 58,
        restingHrTypical: 48,
      };
    }
    if (code === 'sleep_poor') {
      return {
        sleepMinutes: 8 * 60,
        sleepTargetMinutes: 8 * 60,
        sleepDeepMin: 20,
        sleepRemMin: 20,
      };
    }
    if (code === 'hrv_low') {
      return { hrv: 40, hrvBaselineLow: 50, hrvBaselineHigh: 70 };
    }
    if (code === 'sleep_short') {
      return { sleepMinutes: 5 * 60, sleepTargetMinutes: 8 * 60 };
    }
    return null;
  }

  it('emits no unreplaced {token} on Recovery payload for every dimension variant', () => {
    for (const [dimension, codes] of Object.entries(LIMITER_SIGNAL_BY_DIMENSION)) {
      for (const code of codes) {
        const signal = resolveLimiterSignal({
          primaryLimitingFactor: dimension as 'autonomic' | 'sleep' | 'subjective' | 'loadContext',
          hints: hintsForSignal(code),
        });
        expect(signal?.code).toBe(code);

        const json = projectV1Recovery(recoverySource(code), '2026-09-15');
        assertNoUnreplacedTokens(json);
        expect(json.limiterSignal).toBe(code);
        expect(json.limiter).toBe(limiterSignalLabel(code));
        expect(json.limiter).not.toMatch(/système autonome/i);
      }
    }
  });

  it('still resolves legacy limiting-factor i18n without placeholders', () => {
    for (const limiter of ['autonomic', 'sleep', 'subjective', 'loadContext'] as const) {
      const text = resolve({
        code: 'reasoning.limitingFactor.recovery.deficit',
        params: { limiter },
      });
      expect(text).not.toMatch(UNREPLACED_TOKEN);
      expect(text).toBe('Récupération en déficit');
    }
  });
});
