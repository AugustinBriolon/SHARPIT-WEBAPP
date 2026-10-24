import { describe, expect, it, vi } from 'vitest';
import {
  fetchAthleteThresholds,
  pickMaxHeartRateFromZones,
} from '@sharpit/server/lib/integrations/garmin/garmin';

/** Stub client: resolves per-URL, or rejects when the value is an Error. */
function stubClient(responses: Record<string, unknown>) {
  return {
    get: async (url: string) => {
      const match = Object.entries(responses).find(([key]) => url.includes(key));
      const value = match?.[1];
      if (value instanceof Error) {
        throw value;
      }
      return value ?? null;
    },
  } as never;
}

const ALL_OK = {
  'user-settings': {
    userData: { lactateThresholdHeartRate: 172, vo2MaxRunning: 55, vo2MaxCycling: 58 },
  },
  heartRateZones: [{ sport: 'DEFAULT', maxHeartRateUsed: 207 }],
  powerZones: { functionalThresholdPower: 210 },
};

describe('pickMaxHeartRateFromZones', () => {
  it('prefers DEFAULT sport maxHeartRateUsed', () => {
    expect(
      pickMaxHeartRateFromZones([
        { sport: 'RUNNING', maxHeartRateUsed: 188 },
        { sport: 'DEFAULT', maxHeartRateUsed: 193 },
        { sport: 'CYCLING', maxHeartRateUsed: 185 },
      ]),
    ).toBe(193);
  });

  it('falls back to RUNNING then first usable row', () => {
    expect(
      pickMaxHeartRateFromZones([
        { sport: 'CYCLING', maxHeartRateUsed: 185 },
        { sport: 'RUNNING', maxHeartRateUsed: 190 },
      ]),
    ).toBe(190);
    expect(pickMaxHeartRateFromZones([{ sport: 'CYCLING', maxHeartRateUsed: 185 }])).toBe(185);
  });

  it('returns null for empty or invalid payloads', () => {
    expect(pickMaxHeartRateFromZones(null)).toBeNull();
    expect(pickMaxHeartRateFromZones([])).toBeNull();
    expect(pickMaxHeartRateFromZones([{ sport: 'DEFAULT', maxHeartRateUsed: 0 }])).toBeNull();
  });
});

describe('fetchAthleteThresholds', () => {
  it('reads every threshold when all sources answer', async () => {
    const result = await fetchAthleteThresholds(stubClient(ALL_OK));
    expect(result).toMatchObject({ lthr: 172, maxHr: 207, ftpW: 210, vo2maxRunning: 55 });
    expect(result.failedSources).toEqual([]);
  });

  it('names the sources that failed instead of returning a bare null', async () => {
    // A null field must not be ambiguous between "Garmin has no value" and "the
    // request failed": the two need different handling, and silently conflating
    // them let this app run on a null maxHr while reporting a successful sync.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await fetchAthleteThresholds(
      stubClient({
        ...ALL_OK,
        heartRateZones: new Error('503'),
        powerZones: new Error('timeout'),
      }),
    );

    expect(result.maxHr).toBeNull();
    expect(result.ftpW).toBeNull();
    expect(result.failedSources).toEqual(['heart-rate-zones', 'power-zones']);
    // Still reads what did work.
    expect(result.lthr).toBe(172);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('reports no failure when a source answers but holds no value', async () => {
    // Garmin genuinely omits lactateThresholdHeartRate for athletes who never ran
    // the guided test. That is an absent value, not a broken request.
    const result = await fetchAthleteThresholds(
      stubClient({ ...ALL_OK, 'user-settings': { userData: { vo2MaxRunning: 55 } } }),
    );
    expect(result.lthr).toBeNull();
    expect(result.vo2maxRunning).toBe(55);
    expect(result.failedSources).toEqual([]);
  });
});
