import { describe, expect, it } from 'vitest';
import { resolve, resolveCode } from './french';

const RECOVERY_LIMITING_CODES = [
  'reasoning.limitingFactor.recovery.deficit',
  'reasoning.limitingFactor.recovery.criticallyLow',
  'reasoning.limitingFactor.recovery.reduced',
] as const;

const LIMITER_PARAMS = ['autonomic', 'sleep', 'subjective', 'loadContext'] as const;

const UNREPLACED_TOKEN = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

describe('french resolve — never emit unreplaced {tokens}', () => {
  it('never leaves an unreplaced {token} for recovery limiting codes (± limiter param)', () => {
    for (const code of RECOVERY_LIMITING_CODES) {
      expect(resolve({ code })).not.toMatch(UNREPLACED_TOKEN);
      expect(resolveCode(code)).not.toMatch(UNREPLACED_TOKEN);
      for (const limiter of LIMITER_PARAMS) {
        expect(resolve({ code, params: { limiter } })).not.toMatch(UNREPLACED_TOKEN);
      }
    }
  });

  it('omits missing params instead of emitting {param}', () => {
    expect(resolve({ code: 'reasoning.limitingFactor.recovery.deficit' })).not.toContain(
      '{limiter}',
    );
    expect(resolve({ code: 'reasoning.limitingFactor.recovery.criticallyLow' })).toBe(
      'Récupération critique',
    );
    expect(resolve({ code: 'reasoning.limitingFactor.recovery.reduced' })).toBe(
      'Récupération réduite',
    );
  });

  it('resolves recover focus without placeholders', () => {
    const focus = resolveCode('reasoning.topAction.recover.focusDefault');
    expect(focus).toBeTruthy();
    expect(focus).not.toMatch(UNREPLACED_TOKEN);
  });

  it('pluralises jour(s) from the days param', () => {
    expect(
      resolve({
        code: 'reasoning.finding.overreachingRisk.evidence.accumulationDays',
        params: { days: 1 },
      }),
    ).toBe('Accumulation depuis 1 jour');
    expect(
      resolve({
        code: 'reasoning.finding.overreachingRisk.evidence.accumulationDays',
        params: { days: 6 },
      }),
    ).toBe('Accumulation depuis 6 jours');
  });
});
