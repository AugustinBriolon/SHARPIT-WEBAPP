import { describe, expect, it } from 'vitest';
import { type BloodTestReading, markerRows, sparkline } from './carnet-markers';

const TESTS: BloodTestReading[] = [
  {
    id: 'old',
    sampledAt: '2026-08-20T07:30:00.000Z',
    results: [
      {
        markerKey: 'ferritin',
        value: 52,
        unit: 'µg/L',
        refLow: 30,
        refHigh: 300,
        status: 'in_range',
      },
    ],
  },
  {
    id: 'new',
    sampledAt: '2026-11-03T07:30:00.000Z',
    results: [
      { markerKey: 'ferritin', value: 28, unit: 'µg/L', refLow: 30, refHigh: 300, status: 'low' },
      {
        markerKey: 'potassium',
        value: 4.2,
        unit: 'mmol/L',
        refLow: null,
        refHigh: null,
        status: 'no_reference',
      },
    ],
  },
];

describe('markerRows', () => {
  it('reads each marker at its latest test and keeps its values oldest first', () => {
    const [ferritin, potassium] = markerRows(TESTS);
    expect(ferritin).toMatchObject({
      label: 'Ferritine',
      value: 28,
      status: 'low',
      history: [52, 28],
    });
    expect(potassium?.history).toEqual([4.2]);
  });

  it('places a value under its range left of the band, and none without a range', () => {
    const [ferritin, potassium] = markerRows(TESTS);
    expect(ferritin?.position).toBeLessThan(25);
    expect(potassium?.position).toBeNull();
  });

  it('puts the middle of the range in the middle of the bar', () => {
    const rows = markerRows([
      {
        id: 'a',
        sampledAt: '2026-11-03T07:30:00.000Z',
        results: [
          {
            markerKey: 'hemoglobin',
            value: 15,
            unit: 'g/dL',
            refLow: 13,
            refHigh: 17,
            status: 'in_range',
          },
        ],
      },
    ]);
    expect(rows[0]?.position).toBe(50);
  });
});

describe('sparkline', () => {
  it('draws from the first value to the last, the lowest at the foot', () => {
    expect(sparkline([10, 20], 80, 24)).toBe('0.0,22.0 80.0,2.0');
  });

  it('is empty under two values', () => {
    expect(sparkline([10], 80, 24)).toBe('');
  });
});
