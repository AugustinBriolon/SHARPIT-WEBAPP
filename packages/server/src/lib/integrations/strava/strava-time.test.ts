import { describe, expect, it } from 'vitest';
import { ActivityType } from '@prisma/client';
import { activitiesMatch } from '@sharpit/server/lib/activity/list/activity-dedup';
import { appleHealthWallClockStart } from '@sharpit/server/lib/integrations/apple-health/apple-health-time';
import { stravaLocalWallClockAsUtc, stravaWallClockStart } from './strava-time';

describe('stravaLocalWallClockAsUtc', () => {
  it('reads wall digits even when Strava appends a fake Z', () => {
    expect(stravaLocalWallClockAsUtc('2026-07-07T09:00:00Z')).toEqual(
      new Date(Date.UTC(2026, 6, 7, 9, 0, 0)),
    );
  });

  it('reads an offset-bearing local string as wall digits', () => {
    expect(stravaLocalWallClockAsUtc('2026-07-07T09:00:00+02:00')).toEqual(
      new Date(Date.UTC(2026, 6, 7, 9, 0, 0)),
    );
  });
});

describe('stravaWallClockStart', () => {
  it('prefers start_date_local over the UTC instant', () => {
    expect(
      stravaWallClockStart(
        {
          // Real UTC for 09:00 in Paris summer (UTC+2)
          start_date: '2026-07-07T07:00:00Z',
          start_date_local: '2026-07-07T09:00:00Z',
        },
        'Europe/Paris',
      ),
    ).toEqual(new Date(Date.UTC(2026, 6, 7, 9, 0, 0)));
  });

  it('projects start_date into the athlete timezone when local is missing', () => {
    expect(stravaWallClockStart({ start_date: '2026-07-07T07:00:00Z' }, 'Europe/Paris')).toEqual(
      new Date(Date.UTC(2026, 6, 7, 9, 0, 0)),
    );
  });
});

describe('Strava vs Apple Health fingerprint (Paris morning run)', () => {
  it('matches the same session when Strava used UTC and AH used wall-clock', () => {
    const ahDate = appleHealthWallClockStart('2026-07-07T09:00:00+02:00', 'Europe/Paris');
    const stravaDate = stravaWallClockStart(
      {
        start_date: '2026-07-07T07:00:00Z',
        start_date_local: '2026-07-07T09:00:00Z',
      },
      'Europe/Paris',
    );

    expect(ahDate).toEqual(stravaDate);
    expect(
      activitiesMatch(
        { type: ActivityType.RUN, date: ahDate, duration: 2400, distanceM: 8_000 },
        { type: ActivityType.RUN, date: stravaDate, duration: 2380, distanceM: 8_010 },
      ),
    ).toBe(true);
  });

  it('would miss when fingerprinting on Strava UTC instant alone', () => {
    const ahDate = appleHealthWallClockStart('2026-07-07T09:00:00+02:00', 'Europe/Paris');
    const stravaUtcInstant = new Date('2026-07-07T07:00:00Z');

    expect(
      activitiesMatch(
        { type: ActivityType.RUN, date: ahDate, duration: 2400, distanceM: 8_000 },
        {
          type: ActivityType.RUN,
          date: stravaUtcInstant,
          duration: 2380,
          distanceM: 8_010,
        },
      ),
    ).toBe(false);
  });
});
