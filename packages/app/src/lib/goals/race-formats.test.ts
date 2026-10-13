import { describe, expect, it } from 'vitest';
import { parseRaceTargetSeconds } from '@sharpit/app/lib/goals/goal-race-projection';
import {
  RACE_DISCIPLINES,
  RACE_FORMATS,
  findRaceFormat,
  legacyRaceFormat,
  legacyTargetPerformance,
  missingLegs,
  raceTargetBounds,
  resolveStructuredRace,
} from '@sharpit/app/lib/goals/race-formats';

describe('race-format catalog', () => {
  it('covers every discipline with unique keys', () => {
    expect(new Set(RACE_FORMATS.map((f) => f.discipline))).toEqual(new Set(RACE_DISCIPLINES));
    expect(new Set(RACE_FORMATS.map((f) => f.key)).size).toBe(RACE_FORMATS.length);
  });

  it('carries the projection’s own triathlon distances', () => {
    expect(findRaceFormat('TRIATHLON', 'TRI_L')?.distances).toEqual({
      swimM: 1900,
      bikeM: 90_000,
      runM: 21_097,
    });
    expect(findRaceFormat('TRIATHLON', 'TRI_XXL')?.distances.bikeM).toBe(180_000);
    expect(findRaceFormat('RUN', 'TRI_L')).toBeNull();
  });

  it('bounds block impossible targets and keep real ones', () => {
    const half = findRaceFormat('TRIATHLON', 'TRI_L')!.targetBounds;
    expect(half.minSec).toBeGreaterThan(2 * 3600);
    expect(half.minSec).toBeLessThan(3.5 * 3600); // world best ≈ 3:26
    expect(half.maxSec).toBeGreaterThan(8.5 * 3600); // usual cut-off
    const marathon = findRaceFormat('RUN', 'RUN_MARATHON')!.targetBounds;
    expect(marathon.minSec).toBeLessThan(2 * 3600);
    expect(marathon.maxSec).toBeGreaterThanOrEqual(7 * 3600);
    for (const format of RACE_FORMATS) {
      expect(format.targetBounds.minSec).toBeLessThan(format.targetBounds.maxSec);
    }
  });

  it('prices climbing into a custom race’s bounds', () => {
    const flat = raceTargetBounds({ discipline: 'TRAIL', formatKey: 'TRAIL_CUSTOM', runM: 42_000 });
    const hilly = raceTargetBounds({
      discipline: 'TRAIL',
      formatKey: 'TRAIL_CUSTOM',
      runM: 42_000,
      runElevationM: 2500,
    });
    expect(hilly.minSec).toBeGreaterThan(flat.minSec);
    expect(hilly.maxSec).toBeGreaterThan(flat.maxSec);
  });
});

describe('resolveStructuredRace', () => {
  it('forces a fixed format’s distances and keeps an editable one’s', () => {
    expect(
      resolveStructuredRace({ discipline: 'RUN', formatKey: 'RUN_10K', runM: 3000 })?.runM,
    ).toBe(10_000);
    expect(
      resolveStructuredRace({ discipline: 'TRAIL', formatKey: 'TRAIL_CUSTOM', runM: 55_000 })?.runM,
    ).toBe(55_000);
    expect(resolveStructuredRace({ discipline: 'TRAIL', formatKey: 'TRAIL_CUSTOM' })?.runM).toBe(
      30_000,
    );
    expect(resolveStructuredRace({ discipline: 'BIKE', formatKey: 'RUN_10K' })).toBeNull();
  });

  it('lists the legs a race still misses', () => {
    expect(missingLegs({ discipline: 'DUATHLON', formatKey: 'DUA_CUSTOM', runM: 5000 })).toEqual([
      'bikeM',
      'run2M',
    ]);
    expect(
      missingLegs(resolveStructuredRace({ discipline: 'DUATHLON', formatKey: 'DUA_M' })!),
    ).toEqual([]);
  });
});

describe('legacy strings', () => {
  it('labels fixed formats and spells out editable ones', () => {
    expect(legacyRaceFormat({ discipline: 'TRIATHLON', formatKey: 'TRI_L' })).toBe('Triathlon L');
    expect(
      legacyRaceFormat({
        discipline: 'TRAIL',
        formatKey: 'TRAIL_CUSTOM',
        runM: 42_500,
        runElevationM: 2500,
      }),
    ).toBe('Trail · 42,5 km · 2500 m D+');
  });

  it('writes targets the legacy parser reads back', () => {
    for (const seconds of [2535, 5400, 19_710, 19_800]) {
      expect(parseRaceTargetSeconds(legacyTargetPerformance(seconds))).toBe(seconds);
    }
    expect(legacyTargetPerformance(19_800)).toBe('Sub 5h30');
  });
});
