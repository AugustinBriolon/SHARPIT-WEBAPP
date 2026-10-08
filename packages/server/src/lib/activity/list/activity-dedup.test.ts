import { describe, expect, it } from 'vitest';
import { ActivityType } from '@prisma/client';
import {
  activitiesMatch,
  mergedSource,
  sourceIncludes,
} from '@sharpit/server/lib/activity/list/activity-dedup';

describe('mergedSource', () => {
  it('returns both when garmin and strava', () => {
    expect(mergedSource(true, true)).toBe('both');
    expect(mergedSource(true, false)).toBe('garmin');
    expect(mergedSource(false, true)).toBe('strava');
    expect(mergedSource(false, false)).toBe('manual');
  });

  it('preserves apple-health in composites', () => {
    expect(mergedSource(false, true, true)).toBe('strava+apple-health');
    expect(mergedSource(true, true, true)).toBe('garmin+strava+apple-health');
    expect(mergedSource(true, false, true)).toBe('garmin+apple-health');
    expect(mergedSource(false, false, true)).toBe('apple-health');
  });
});

describe('sourceIncludes', () => {
  it('reads legacy both and composites', () => {
    expect(sourceIncludes('both', 'garmin')).toBe(true);
    expect(sourceIncludes('both', 'strava')).toBe(true);
    expect(sourceIncludes('strava+apple-health', 'apple-health')).toBe(true);
    expect(sourceIncludes('strava+apple-health', 'garmin')).toBe(false);
  });
});

describe('activitiesMatch', () => {
  const base = new Date('2026-07-07T18:00:00');

  it('matches same fingerprint within tolerance', () => {
    expect(
      activitiesMatch(
        { type: ActivityType.RUN, date: base, duration: 3600 },
        { type: ActivityType.RUN, date: new Date(base.getTime() + 5 * 60_000), duration: 3650 },
      ),
    ).toBe(true);
  });

  it('rejects different sports', () => {
    expect(
      activitiesMatch(
        { type: ActivityType.RUN, date: base, duration: 3600 },
        { type: ActivityType.BIKE, date: base, duration: 3600 },
      ),
    ).toBe(false);
  });

  it('rejects when start times are too far apart', () => {
    expect(
      activitiesMatch(
        { type: ActivityType.RUN, date: base, duration: 3600 },
        { type: ActivityType.RUN, date: new Date(base.getTime() + 20 * 60_000), duration: 3600 },
      ),
    ).toBe(false);
  });

  it('matches on time only when duration is missing for non-STRENGTH', () => {
    expect(
      activitiesMatch(
        { type: ActivityType.OTHER, date: base, duration: null },
        {
          type: ActivityType.OTHER,
          date: new Date(base.getTime() + 2 * 60_000),
          duration: null,
        },
      ),
    ).toBe(true);
  });

  it('refuses STRENGTH time-only match without durations', () => {
    expect(
      activitiesMatch(
        { type: ActivityType.STRENGTH, date: base, duration: null },
        {
          type: ActivityType.STRENGTH,
          date: new Date(base.getTime() + 2 * 60_000),
          duration: null,
        },
      ),
    ).toBe(false);
  });

  it('matches the same STRENGTH session when durations align', () => {
    expect(
      activitiesMatch(
        { type: ActivityType.STRENGTH, date: base, duration: 3_600 },
        {
          type: ActivityType.STRENGTH,
          date: new Date(base.getTime() + 90_000),
          duration: 3_580,
        },
      ),
    ).toBe(true);
  });

  it('keeps two STRENGTH sessions 30 minutes apart as distinct', () => {
    expect(
      activitiesMatch(
        { type: ActivityType.STRENGTH, date: base, duration: 3_600 },
        {
          type: ActivityType.STRENGTH,
          date: new Date(base.getTime() + 30 * 60_000),
          duration: 3_600,
        },
      ),
    ).toBe(false);
  });

  it('matches via alt duration when Garmin moving diverges from Apple elapsed', () => {
    expect(
      activitiesMatch(
        {
          type: ActivityType.RUN,
          date: base,
          duration: 2_400,
          altDurations: [2_700],
        },
        {
          type: ActivityType.RUN,
          date: new Date(base.getTime() + 30_000),
          duration: 2_700,
        },
      ),
    ).toBe(true);
  });

  it('matches via distance when durations diverge beyond tolerance', () => {
    expect(
      activitiesMatch(
        {
          type: ActivityType.RUN,
          date: base,
          duration: 2_400,
          distanceM: 8_000,
        },
        {
          type: ActivityType.RUN,
          date: new Date(base.getTime() + 45_000),
          duration: 2_820,
          distanceM: 8_020,
        },
      ),
    ).toBe(true);
  });

  it('rejects when durations and distances both diverge', () => {
    expect(
      activitiesMatch(
        {
          type: ActivityType.RUN,
          date: base,
          duration: 2_400,
          distanceM: 8_000,
        },
        {
          type: ActivityType.RUN,
          date: base,
          duration: 2_820,
          distanceM: 10_500,
        },
      ),
    ).toBe(false);
  });
});
