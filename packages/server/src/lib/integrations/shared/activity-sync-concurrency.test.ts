import { describe, expect, it, vi } from 'vitest';
import { mapWithConcurrency } from '@sharpit/server/lib/async/map-with-concurrency';
import { STRAVA_ACTIVITY_CONCURRENCY } from '@sharpit/server/lib/integrations/strava/strava-sync';

describe('activity sync concurrency constants', () => {
  it('bounds Strava concurrency within safe DB limits', () => {
    expect(STRAVA_ACTIVITY_CONCURRENCY).toBeGreaterThanOrEqual(2);
    expect(STRAVA_ACTIVITY_CONCURRENCY).toBeLessThanOrEqual(8);
  });
});

describe('activity page parallel processing pattern', () => {
  it('processes a page of candidates with bounded concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    const outcomes = await mapWithConcurrency(items, 3, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return n * 2;
    });

    expect(outcomes).toEqual(items.map((n) => n * 2));
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('preserves order when aggregating parallel outcomes', async () => {
    const spy = vi.fn(async (n: number) => {
      await new Promise((r) => setTimeout(r, 10 - n));
      return `id-${n}`;
    });
    const results = await mapWithConcurrency([1, 2, 3], 2, spy);
    expect(results).toEqual(['id-1', 'id-2', 'id-3']);
  });
});
