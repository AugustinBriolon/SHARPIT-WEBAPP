import { describe, expect, it } from 'vitest';
import { pickCurrentBodyBattery } from './garmin-body-battery';

describe('pickCurrentBodyBattery', () => {
  it('prefers bodyBatteryMostRecentValue over the series peak', () => {
    expect(
      pickCurrentBodyBattery({
        bodyBatteryMostRecentValue: 26,
        bodyBatteryValuesArray: [
          [1, 0, 99, 1],
          [2, 0, 80, 1],
          [3, 0, 26, 1],
        ],
      }),
    ).toBe(26);
  });

  it('falls back to the last sample in a 4-tuple series (not the max)', () => {
    expect(
      pickCurrentBodyBattery({
        bodyBatteryValuesArray: [
          [1, 0, 99, 1],
          [2, 0, 55, 1],
          [3, 0, 26, 1],
        ],
      }),
    ).toBe(26);
  });

  it('supports 2-tuple [timestamp, level] samples', () => {
    expect(
      pickCurrentBodyBattery({
        bodyBatteryValuesArray: [
          [1, 90],
          [2, 40],
        ],
      }),
    ).toBe(40);
  });

  it('returns null when no usable value exists', () => {
    expect(pickCurrentBodyBattery(null)).toBeNull();
    expect(pickCurrentBodyBattery({})).toBeNull();
    expect(pickCurrentBodyBattery({ bodyBatteryValuesArray: [[1, 'x']] })).toBeNull();
  });
});
