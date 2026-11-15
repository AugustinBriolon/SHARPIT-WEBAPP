import { describe, expect, it } from 'vitest';
import type { GateContext, GateProposal } from '@sharpit/app/lib/plan-gate/types';
import { strengthLoadRule } from './strength-completeness';

const context = (bests?: Record<string, number>) => ({ strengthBestKg: bests }) as GateContext;
const proposal = (weightKg: number | null, exercise = 'Développé couché') =>
  ({
    type: 'STRENGTH',
    strengthPrescription: {
      version: 1,
      sets: [{ exercise, sets: 3, reps: 8, weightKg, order: 0 }],
    },
  }) as unknown as GateProposal;

describe('strengthLoadRule', () => {
  const bests = { 'developpe couche': 70 };

  it('flags a load more than 5 % above the best, whatever the spelling', () => {
    const [finding] = strengthLoadRule(context(bests), proposal(80, 'developpe  couché'));
    expect(finding?.ruleCode).toBe('STRENGTH_LOAD_ABOVE_BEST');
    expect(finding?.rationale).toContain('80 kg (meilleur 70 kg)');
  });

  it('lets a progression within 5 % through', () => {
    expect(strengthLoadRule(context(bests), proposal(73))).toEqual([]);
  });

  it('says nothing of an exercise never lifted, a bodyweight set or a missing history', () => {
    expect(strengthLoadRule(context(bests), proposal(200, 'Squat'))).toEqual([]);
    expect(strengthLoadRule(context(bests), proposal(null))).toEqual([]);
    expect(strengthLoadRule(context(), proposal(200))).toEqual([]);
  });
});
