import { describe, expect, it } from 'vitest';
import { buildTopAction } from '../scoring';

describe('buildTopAction RECOVER', () => {
  it('uses the recover focus code — never a limiting-factor template (no {limiter} leak)', () => {
    const action = buildTopAction(
      'RECOVER',
      {
        system: 'RECOVERY',
        description: {
          code: 'reasoning.limitingFactor.recovery.deficit',
          params: { limiter: 'autonomic' },
        },
        actionable: true,
      },
      null,
    );
    expect(action?.verbCode).toBe('reasoning.topAction.recover.verb');
    expect(action?.focusCode).toBe('reasoning.topAction.recover.focusDefault');
    expect(action?.focusCode).not.toMatch(/limitingFactor/);
  });
});
