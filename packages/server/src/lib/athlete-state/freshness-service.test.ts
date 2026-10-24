import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_PROVIDER_STALE_HOURS,
  garminSyncReference,
  resolveRecommendationsFreshness,
} from './freshness-service';

const EARLIER = new Date('2026-07-15T08:00:00.000Z');
const LATER = new Date('2026-07-15T12:00:00.000Z');

function recommendationsInput(
  overrides: Partial<Parameters<typeof resolveRecommendationsFreshness>[0]> = {},
) {
  return {
    computingRecommendations: false,
    briefingAt: EARLIER,
    reasoningAt: null,
    sessionEvidence: null,
    phaseAtGeneration: null,
    currentBriefingPhase: 'morning',
    ...overrides,
  };
}

describe('resolveRecommendationsFreshness', () => {
  it('is computing while a recommendation run is in flight', () => {
    expect(
      resolveRecommendationsFreshness(recommendationsInput({ computingRecommendations: true })),
    ).toBe('computing');
  });

  it('is awaiting_data when no briefing exists yet', () => {
    expect(resolveRecommendationsFreshness(recommendationsInput({ briefingAt: null }))).toBe(
      'awaiting_data',
    );
  });

  it('is stale when reasoning ran after the briefing', () => {
    expect(resolveRecommendationsFreshness(recommendationsInput({ reasoningAt: LATER }))).toBe(
      'stale',
    );
  });

  it('is stale when a new session landed after the briefing', () => {
    expect(resolveRecommendationsFreshness(recommendationsInput({ sessionEvidence: LATER }))).toBe(
      'stale',
    );
  });

  it('is stale when the briefing phase differs from the current phase (morning → afternoon)', () => {
    expect(
      resolveRecommendationsFreshness(
        recommendationsInput({ phaseAtGeneration: 'morning', currentBriefingPhase: 'afternoon' }),
      ),
    ).toBe('stale');
  });

  it('is fresh when nothing changed and the phase matches', () => {
    expect(
      resolveRecommendationsFreshness(
        recommendationsInput({ phaseAtGeneration: 'morning', currentBriefingPhase: 'morning' }),
      ),
    ).toBe('fresh');
  });

  it('is fresh when phaseAtGeneration is unknown (legacy briefing, no phase recorded)', () => {
    expect(
      resolveRecommendationsFreshness(recommendationsInput({ currentBriefingPhase: 'afternoon' })),
    ).toBe('fresh');
  });
});

describe('garminSyncReference', () => {
  it('is null when activity sync never ran (forces stale)', () => {
    expect(garminSyncReference(LATER, null)).toBeNull();
  });

  it('returns the older of health and activity syncs', () => {
    expect(garminSyncReference(LATER, EARLIER)).toEqual(EARLIER);
    expect(garminSyncReference(EARLIER, LATER)).toEqual(EARLIER);
  });
});

describe('ACTIVITY_PROVIDER_STALE_HOURS', () => {
  it('keeps near-realtime pull under one hour', () => {
    expect(ACTIVITY_PROVIDER_STALE_HOURS).toBeLessThanOrEqual(1);
    expect(ACTIVITY_PROVIDER_STALE_HOURS).toBeGreaterThan(0);
  });
});
