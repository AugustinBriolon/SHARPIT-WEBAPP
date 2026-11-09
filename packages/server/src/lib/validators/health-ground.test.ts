import { describe, expect, it } from 'vitest';
import { putHealthGroundsSchema } from './health-ground';

describe('putHealthGroundsSchema', () => {
  it('accepts catalog keys with their own stages', () => {
    const parsed = putHealthGroundsSchema.parse({
      grounds: [
        { key: 'postpartum', stage: '6_to_12_weeks' },
        { key: 'other', stage: 'declared', details: '  Asthme d’effort ' },
      ],
    });
    expect(parsed.grounds[1]?.details).toBe('Asthme d’effort');
  });

  it('refuses a stage from another entry, an unknown key and a duplicate', () => {
    expect(
      putHealthGroundsSchema.safeParse({ grounds: [{ key: 'asthma', stage: 't1' }] }).success,
    ).toBe(false);
    expect(
      putHealthGroundsSchema.safeParse({ grounds: [{ key: 'flu', stage: 'declared' }] }).success,
    ).toBe(false);
    expect(
      putHealthGroundsSchema.safeParse({
        grounds: [
          { key: 'asthma', stage: 'controlled' },
          { key: 'asthma', stage: 'uncontrolled' },
        ],
      }).success,
    ).toBe(false);
  });
});
