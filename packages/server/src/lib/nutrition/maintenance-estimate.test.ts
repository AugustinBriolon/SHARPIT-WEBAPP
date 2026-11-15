import { describe, expect, it } from 'vitest';
import { estimateMaintenanceKcal } from './maintenance-estimate';

const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n));
const diary = (kcal: number, days = 24) => Array.from({ length: days }, () => kcal);

describe('estimateMaintenanceKcal', () => {
  it('is the mean intake when the weight holds', () => {
    const weighIns = [0, 7, 14, 21].map((n) => ({ at: day(n), kg: 72 }));
    expect(estimateMaintenanceKcal({ loggedKcal: diary(2600), weighIns })).toBe(2600);
  });

  it('adds what a falling weight says was drawn from the body', () => {
    // 0.5 kg lost a week on 2 200 kcal: 550 kcal a day came from reserves.
    const weighIns = [0, 7, 14, 21].map((n) => ({ at: day(n), kg: 72 - (n / 7) * 0.5 }));
    expect(estimateMaintenanceKcal({ loggedKcal: diary(2200), weighIns })).toBe(2750);
  });

  it('says nothing on a thin diary or weigh-ins too close together', () => {
    const steady = [0, 7, 14, 21].map((n) => ({ at: day(n), kg: 72 }));
    expect(estimateMaintenanceKcal({ loggedKcal: diary(2600, 10), weighIns: steady })).toBeNull();
    const close = [0, 2, 4].map((n) => ({ at: day(n), kg: 72 }));
    expect(estimateMaintenanceKcal({ loggedKcal: diary(2600), weighIns: close })).toBeNull();
  });
});
