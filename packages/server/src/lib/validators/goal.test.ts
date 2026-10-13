import { describe, expect, it } from 'vitest';
import { settleStructuredRace, updateGoalSchema } from '@sharpit/server/lib/validators/goal';

const STORED = {
  discipline: null,
  formatKey: null,
  swimM: null,
  bikeM: null,
  runM: null,
  run2M: null,
  segments: null,
  bikeElevationM: null,
  runElevationM: null,
  openWater: null,
  targetSeconds: null,
  raceFormat: null,
  targetPerformance: null,
};

const parse = (body: unknown) => updateGoalSchema.parse(body);

describe('settleStructuredRace', () => {
  it('settles catalog distances and derives the legacy strings', () => {
    const settled = settleStructuredRace(
      parse({ discipline: 'TRIATHLON', formatKey: 'TRI_L', runM: 5000, targetSeconds: 19_800 }),
      null,
    );
    expect(settled).toEqual({
      ok: true,
      data: expect.objectContaining({
        swimM: 1900,
        bikeM: 90_000,
        runM: 21_097,
        targetSeconds: 19_800,
        raceFormat: 'Triathlon L',
        targetPerformance: 'Sub 5h30',
      }),
    });
  });

  it('refuses a target outside the format bounds, with the bounds', () => {
    const settled = settleStructuredRace(
      parse({ discipline: 'TRIATHLON', formatKey: 'TRI_L', targetSeconds: 7200 }),
      null,
    );
    expect(settled).toEqual({
      ok: false,
      body: { error: expect.any(String), minSec: expect.any(Number), maxSec: expect.any(Number) },
    });
  });

  it('checks a target-only edit against the stored race', () => {
    const stored = { ...STORED, discipline: 'RUN' as const, formatKey: 'RUN_10K', runM: 10_000 };
    expect(settleStructuredRace(parse({ targetSeconds: 600 }), stored).ok).toBe(false);
    expect(settleStructuredRace(parse({ targetSeconds: 2700 }), stored)).toMatchObject({
      ok: true,
      data: { runM: 10_000, targetPerformance: 'Sub 45:00' },
    });
  });

  it('requires the climbing of a trail and an unknown key fails', () => {
    expect(
      settleStructuredRace(parse({ discipline: 'TRAIL', formatKey: 'TRAIL_CUSTOM' }), null).ok,
    ).toBe(false);
    expect(
      settleStructuredRace(
        parse({
          discipline: 'TRAIL',
          formatKey: 'TRAIL_CUSTOM',
          runM: 42_000,
          runElevationM: 2500,
        }),
        null,
      ).ok,
    ).toBe(true);
    expect(settleStructuredRace(parse({ discipline: 'RUN', formatKey: 'TRI_L' }), null).ok).toBe(
      false,
    );
  });

  it('drops the structured race a new free-text format contradicts', () => {
    const stored = {
      ...STORED,
      discipline: 'RUN' as const,
      formatKey: 'RUN_10K',
      runM: 10_000,
      raceFormat: '10 km',
    };
    expect(settleStructuredRace(parse({ raceFormat: '10 km' }), stored)).toEqual({
      ok: true,
      data: {},
    });
    expect(settleStructuredRace(parse({ raceFormat: 'Marathon' }), stored)).toMatchObject({
      ok: true,
      data: { discipline: null, formatKey: null, runM: null },
    });
  });
});
