import { describe, expect, it } from 'vitest';
import { postBloodTestSchema } from './blood-test';

const ferritin = { markerKey: 'ferritin', value: 60, unit: 'µg/L', refLow: 30, refHigh: 400 };
const body = (results: unknown[], extra: object = {}) => ({
  sampledAt: '2026-01-10T08:00:00.000Z',
  results,
  ...extra,
});

describe('postBloodTestSchema', () => {
  it('accepts catalog markers and defaults missing bounds to null', () => {
    const parsed = postBloodTestSchema.parse(
      body([ferritin, { markerKey: 'cholesterol_total', value: 1.6, unit: 'g/L' }]),
    );
    expect(parsed.results[1]).toMatchObject({ refLow: null, refHigh: null });
  });

  it('refuses an unknown marker, a duplicate and an empty test', () => {
    expect(postBloodTestSchema.safeParse(body([{ ...ferritin, markerKey: 'x' }])).success).toBe(
      false,
    );
    expect(postBloodTestSchema.safeParse(body([ferritin, ferritin])).success).toBe(false);
    expect(postBloodTestSchema.safeParse(body([])).success).toBe(false);
  });

  it('refuses a misread: wrong unit, lost decimal comma, inverted bounds', () => {
    expect(postBloodTestSchema.safeParse(body([{ ...ferritin, unit: 'ng/dL' }])).success).toBe(
      false,
    );
    expect(
      postBloodTestSchema.safeParse(body([{ markerKey: 'potassium', value: 43, unit: 'mmol/L' }]))
        .success,
    ).toBe(false);
    expect(
      postBloodTestSchema.safeParse(body([{ ...ferritin, refLow: 400, refHigh: 30 }])).success,
    ).toBe(false);
  });

  it('refuses a future sampling date and any field beyond the results', () => {
    expect(
      postBloodTestSchema.safeParse({ ...body([ferritin]), sampledAt: '2999-01-01' }).success,
    ).toBe(false);
    expect(postBloodTestSchema.safeParse(body([ferritin], { patientName: 'X' })).success).toBe(
      false,
    );
    expect(postBloodTestSchema.safeParse(body([{ ...ferritin, note: 'X' }])).success).toBe(false);
  });
});
