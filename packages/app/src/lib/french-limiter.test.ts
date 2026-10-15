import { describe, expect, it } from 'vitest';
import { resolve, resolveCode } from './french';

const RECOVERY_LIMITING_CODES = [
  'reasoning.limitingFactor.recovery.deficit',
  'reasoning.limitingFactor.recovery.criticallyLow',
  'reasoning.limitingFactor.recovery.reduced',
] as const;

const LIMITER_PARAMS = ['autonomic', 'sleep', 'subjective', 'loadContext'] as const;

const UNREPLACED_TOKEN = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

describe('french recovery limiting copy', () => {
  it('never leaves an unreplaced {token} for any recovery limiting code × limiter', () => {
    for (const code of RECOVERY_LIMITING_CODES) {
      expect(resolve({ code })).not.toMatch(UNREPLACED_TOKEN);
      expect(resolveCode(code)).not.toMatch(UNREPLACED_TOKEN);
      for (const limiter of LIMITER_PARAMS) {
        const text = resolve({ code, params: { limiter } });
        expect(text).not.toMatch(UNREPLACED_TOKEN);
        expect(text).not.toMatch(/système autonome/i);
      }
    }
  });

  it('keeps the frein out of the limiting-factor sentence', () => {
    for (const code of RECOVERY_LIMITING_CODES) {
      const text = resolve({ code, params: { limiter: 'autonomic' } });
      expect(text.toLowerCase()).not.toContain('frein');
      expect(text).not.toContain('VFC');
    }
  });

  it('resolves recover focus to an action line without placeholders or récup', () => {
    const focus = resolveCode('reasoning.topAction.recover.focusDefault');
    expect(focus).toBe('Séance légère ou repos aujourd’hui.');
    expect(focus).not.toMatch(UNREPLACED_TOKEN);
    expect(focus).not.toMatch(/récup/i);
  });
});
