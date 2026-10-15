import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  googleAccount: { findUnique: vi.fn() },
  activity: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  activityStream: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  strengthSet: { count: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
}));

const observation = vi.hoisted(() => ({ ingest: vi.fn() }));
const streams = vi.hoisted(() => ({ persistStream: vi.fn() }));

vi.mock('@sharpit/db/client', () => ({ prisma: db }));
vi.mock('@sharpit/server/lib/engines/observation-engine', () => ({
  observationEngine: observation,
}));
vi.mock('@sharpit/server/lib/streams/streams', () => ({
  persistStream: streams.persistStream,
}));

const { importLiveStrengthSession } = await import('./live-strength-session');

function densePayload(overrides: Record<string, unknown> = {}) {
  const durationSec = 60;
  const hrSamples = Array.from({ length: 13 }, (_, i) => ({
    t: i * 5,
    bpm: 140,
    source: 'ble' as const,
  }));
  return {
    clientSessionId: 'ios-session-1',
    start: '2026-10-15T10:00:00+02:00',
    durationSec,
    title: 'Renfo A',
    strengthSets: [{ exercise: 'Squat', sets: 3, reps: 8, weightKg: 60, order: 0 }],
    avgHr: 140,
    maxHr: 140,
    hrSamples,
    ...overrides,
  };
}

describe('importLiveStrengthSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.googleAccount.findUnique.mockResolvedValue({ timeZone: 'Europe/Paris' });
    db.activityStream.findFirst.mockResolvedValue(null);
    db.activity.findMany.mockResolvedValue([]);
    db.activity.findUnique.mockResolvedValue(null);
    db.activityStream.findUnique.mockResolvedValue(null);
    streams.persistStream.mockResolvedValue(true);
    observation.ingest.mockResolvedValue(undefined);
  });

  it('creates a strength activity and feeds Coach load via avg HR', async () => {
    db.activity.create.mockResolvedValue({
      id: 'act-new',
      type: 'STRENGTH',
      date: new Date('2026-10-15T10:00:00.000Z'),
      duration: 60,
      garminId: null,
      stravaId: null,
      runMetrics: null,
      bikeMetrics: null,
      swimMetrics: null,
      hikeMetrics: null,
    });

    const result = await importLiveStrengthSession('athlete-1', densePayload());

    expect(result).toMatchObject({
      ok: true,
      activityId: 'act-new',
      outcome: 'created',
      hasHr: true,
      liveHrSource: 'ble',
    });
    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'sharpit-ios',
          type: 'STRENGTH',
          strengthSets: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ exercise: 'Squat', sets: 3, reps: 8 }),
            ]),
          }),
        }),
      }),
    );
    expect(streams.persistStream).toHaveBeenCalledWith(
      'athlete-1',
      'act-new',
      expect.objectContaining({ heartrate: expect.any(Array) }),
      expect.objectContaining({
        liveHr: expect.objectContaining({
          clientSessionId: 'ios-session-1',
          source: 'ble',
        }),
      }),
    );
    expect(observation.ingest).toHaveBeenCalledWith(
      'athlete-1',
      expect.objectContaining({
        hrData: expect.objectContaining({ avgBpm: 140, maxBpm: 140 }),
      }),
    );
  });

  it('is idempotent on the same clientSessionId', async () => {
    db.activityStream.findFirst.mockResolvedValue({
      activity: {
        id: 'act-existing',
        type: 'STRENGTH',
        date: new Date('2026-10-15T10:00:00.000Z'),
        duration: 60,
        garminId: null,
        stravaId: null,
        appleHealthId: null,
        source: 'sharpit-ios',
        rpe: null,
        feeling: null,
        mergedIntoId: null,
      },
    });
    // Same densified coverage as the retry payload — preferHrStream ties → unchanged.
    const time = Array.from({ length: 13 }, (_, i) => i * 5);
    const heartrate = time.map(() => 140);
    db.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: {
        time,
        heartrate,
        distance: [],
        altitude: [],
        watts: [],
        cadence: [],
        velocity: [],
        latlng: [],
        liveHr: { clientSessionId: 'ios-session-1', source: 'ble' },
      },
    });

    const result = await importLiveStrengthSession('athlete-1', densePayload());

    expect(result).toMatchObject({
      ok: true,
      activityId: 'act-existing',
      outcome: 'unchanged',
    });
    expect(db.activity.create).not.toHaveBeenCalled();
    expect(streams.persistStream).not.toHaveBeenCalled();
  });

  it('merges into a watch activity, keeps app sets, takes live HR when more complete', async () => {
    db.activity.findMany.mockResolvedValue([
      {
        id: 'garmin-strength',
        type: 'STRENGTH',
        date: new Date('2026-10-15T10:00:00.000Z'),
        duration: 60,
        garminId: 'g-1',
        stravaId: null,
        appleHealthId: null,
        source: 'garmin',
        rpe: null,
        feeling: null,
        mergedIntoId: null,
        runMetrics: null,
        bikeMetrics: null,
        swimMetrics: null,
        hikeMetrics: null,
      },
    ]);
    db.activity.update.mockResolvedValue({});
    db.strengthSet.count.mockResolvedValue(0);
    db.strengthSet.createMany.mockResolvedValue({ count: 1 });
    // Watch only recorded two HR points — live series covers more.
    db.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: {
        time: [0, 60],
        heartrate: [110, 112],
        distance: [],
        altitude: [],
        watts: [],
        cadence: [],
        velocity: [],
        latlng: [],
      },
    });

    const result = await importLiveStrengthSession('athlete-1', densePayload());

    expect(result).toMatchObject({
      ok: true,
      activityId: 'garmin-strength',
      outcome: 'merged',
      liveHrSource: 'ble',
    });
    expect(db.activity.create).not.toHaveBeenCalled();
    expect(db.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'garmin+sharpit-ios' }),
      }),
    );
    expect(db.strengthSet.createMany).toHaveBeenCalled();
    expect(streams.persistStream).toHaveBeenCalled();
  });

  it('returns INVALID_PAYLOAD without creating when the body is wrong', async () => {
    const result = await importLiveStrengthSession('athlete-1', { durationSec: 60 });
    expect(result).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(db.activity.create).not.toHaveBeenCalled();
  });
});
