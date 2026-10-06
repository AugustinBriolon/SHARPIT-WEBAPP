import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  googleAccount: { findUnique: vi.fn() },
  activity: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@sharpit/db/client', () => ({ prisma: db }));
vi.mock('@sharpit/server/lib/engines/observation-engine', () => ({
  observationEngine: { ingest: vi.fn() },
}));
vi.mock('@sharpit/server/lib/streams/streams', () => ({ persistStream: vi.fn() }));

const { importAppleHealthWorkouts, appleHealthWorkoutSchema } =
  await import('./apple-health-workouts');

describe('importAppleHealthWorkouts · a session Garmin already brought', () => {
  it('skips the workout Apple sends in UTC for the brick Garmin stored in Paris time', async () => {
    db.googleAccount.findUnique.mockResolvedValue({ timeZone: 'Europe/Paris' });
    // Garmin's bike leg of the brick: 12:23:34 Paris wall clock, 4 815 s.
    db.activity.findMany.mockResolvedValue([
      {
        id: 'garmin-bike',
        type: 'BIKE',
        date: new Date('2026-09-30T12:23:34.000Z'),
        duration: 4_815,
        garminId: '24553201218',
        stravaId: null,
        source: 'garmin',
        rpe: null,
        feeling: null,
        runMetrics: null,
        bikeMetrics: { distanceM: 32_100 },
        swimMetrics: null,
        hikeMetrics: null,
      },
    ]);
    const bike = appleHealthWorkoutSchema.parse({
      id: 'HK-1',
      type: 'BIKE',
      title: 'Vélo',
      start: '2026-09-30T10:23:34Z',
      durationSec: 4_816,
    });

    const result = await importAppleHealthWorkouts('athlete-1', [bike]);

    expect(result).toEqual({ imported: 0, skipped: 1, activityIds: [] });
    expect(db.activity.create).not.toHaveBeenCalled();
  });

  it('skips when Apple elapsed diverges from Garmin moving but distance matches', async () => {
    db.googleAccount.findUnique.mockResolvedValue({ timeZone: 'Europe/Paris' });
    db.activity.create.mockClear();
    db.activity.findMany.mockResolvedValue([
      {
        id: 'garmin-run',
        type: 'RUN',
        date: new Date('2026-10-06T18:00:00.000Z'),
        duration: 2_400,
        garminId: '99',
        stravaId: null,
        source: 'garmin',
        rpe: null,
        feeling: null,
        runMetrics: { distanceM: 8_000 },
        bikeMetrics: null,
        swimMetrics: null,
        hikeMetrics: null,
      },
    ]);
    const run = appleHealthWorkoutSchema.parse({
      id: 'HK-2',
      type: 'RUN',
      title: 'Course',
      start: '2026-10-06T16:00:30Z',
      durationSec: 2_820,
      distanceM: 8_015,
    });

    const result = await importAppleHealthWorkouts('athlete-1', [run]);

    expect(result).toEqual({ imported: 0, skipped: 1, activityIds: [] });
    expect(db.activity.create).not.toHaveBeenCalled();
  });
});
