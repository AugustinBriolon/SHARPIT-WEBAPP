import { describe, expect, it } from 'vitest';
import type { RaceAnalysisLeg } from '@sharpit/app/lib/activity/race-analysis-types';
import {
  legsWithPacing,
  legsWithZones,
  pacingValueText,
  pacingVerdict,
  runDriftText,
  signedPctText,
  targetDeltaText,
  zoneShares,
} from './carnet-race-reading';

function leg(overrides: Partial<RaceAnalysisLeg>): RaceAnalysisLeg {
  return {
    kind: 'run',
    label: 'Course à pied',
    durationSec: 6000,
    distanceM: 21100,
    sourceActivityId: null,
    avgHr: null,
    hrZonesSec: null,
    pacing: null,
    ...overrides,
  };
}

describe('targetDeltaText', () => {
  it('says how far under or over the target the race finished', () => {
    expect(targetDeltaText(-132)).toBe("2:12 sous l'objectif");
    expect(targetDeltaText(185)).toBe("3:05 au-dessus de l'objectif");
    expect(targetDeltaText(0)).toBe("Pile sur l'objectif");
    expect(targetDeltaText(null)).toBeNull();
  });
});

describe('pacingValueText', () => {
  it('reads each unit the way its sport is read', () => {
    expect(pacingValueText(120, 'sec_per_100m')).toBe('2:00/100m');
    expect(pacingValueText(300, 'sec_per_km')).toBe("5'00/km");
    expect(pacingValueText(32.45, 'kmh')).toBe('32,5 km/h');
  });
});

describe('signedPctText and pacingVerdict', () => {
  it('signs the change and names it, with a small band read as held', () => {
    expect(signedPctText(4.33)).toBe('+4,3 %');
    expect(signedPctText(-1)).toBe('−1,0 %');
    expect(pacingVerdict(4.3)).toBe('ralenti en 2e moitié');
    expect(pacingVerdict(-3)).toBe('accéléré en 2e moitié');
    expect(pacingVerdict(1.5)).toBe('allure tenue');
  });
});

describe('zoneShares', () => {
  it('turns seconds per zone into shares, and nothing when no heart rate was read', () => {
    expect(zoneShares([0, 60, 180, 60, 0])).toEqual([0, 0.2, 0.6, 0.2, 0]);
    expect(zoneShares([0, 0, 0, 0, 0])).toEqual([]);
  });
});

describe('legsWithZones / legsWithPacing', () => {
  it('keeps only the legs that carry what the block reads', () => {
    const pacing = { unit: 'sec_per_km' as const, firstHalf: 300, secondHalf: 310, changePct: 3.3 };
    const legs = [
      leg({ kind: 'transition', label: 'T1', pacing }),
      leg({ hrZonesSec: [0, 0, 0, 0, 0] }),
      leg({ hrZonesSec: [10, 0, 0, 0, 0], pacing }),
    ];
    expect(legsWithZones(legs)).toHaveLength(1);
    expect(legsWithPacing(legs).map((l) => l.label)).toEqual(['Course à pied']);
  });
});

describe('runDriftText', () => {
  it('reads the run decoupling calmly, as a lead to work on past 5 %', () => {
    expect(runDriftText(3.2)).toContain("Le cœur a tenu l'allure");
    expect(runDriftText(7.8)).toContain('+7,8 %');
    expect(runDriftText(7.8)).toContain('piste de progrès');
    expect(runDriftText(null)).toBeNull();
  });
});
