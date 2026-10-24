import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';

const prismaMock = vi.hoisted(() => ({
  activity: { findFirst: vi.fn() },
  activityStream: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
}));
const garmin = vi.hoisted(() => ({ fetchGarminActivityStreams: vi.fn() }));

vi.mock('@sharpit/db/client', () => ({ prisma: prismaMock }));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-streams', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@sharpit/server/lib/integrations/garmin/garmin-streams')
  >()),
  fetchGarminActivityStreams: garmin.fetchGarminActivityStreams,
}));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-sync', () => ({
  getGarminClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('@sharpit/server/lib/queries', () => ({ getAthleteProfile: vi.fn() }));
vi.mock('@sharpit/server/lib/integrations/strava/strava-sync', () => ({
  getValidAccessToken: vi.fn(),
}));

import { buildMultisportLegStream, persistStream } from '@sharpit/server/lib/streams/streams';

const raw = {
  time: [0, 60, 120, 180],
  distance: [0, 300, 600, 900],
  altitude: [],
  heartrate: [140, 150, 155, 160],
  watts: [],
  cadence: [],
  velocity: [5, 5, 5, 5],
  latlng: [],
};

function runLeg(extra: Partial<MultisportLeg>): MultisportLeg {
  return {
    kind: 'run',
    label: 'Course',
    durationSec: 180,
    movingDurationSec: null,
    distanceM: 900,
    avgHr: null,
    avgSpeedMs: null,
    elevationM: null,
    calories: null,
    garminActivityId: 'g-run',
    transitionIndex: null,
    ...extra,
  };
}

const options = { parentId: 'tri', profile: null };

describe('buildMultisportLegStream — provider calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.activity.findFirst.mockResolvedValue(null);
  });

  it('reads a Garmin leg cached on the parent without calling Garmin', async () => {
    prismaMock.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: { garminLegs: { 'g-run': raw } },
    });

    const stream = await buildMultisportLegStream('athlete-1', runLeg({}), options);

    expect(stream?.stream.available).toBe(true);
    expect(garmin.fetchGarminActivityStreams).not.toHaveBeenCalled();
  });

  it('fetches an uncached Garmin leg once and caches it on the parent', async () => {
    prismaMock.activityStream.findUnique.mockResolvedValue({ available: true, data: { time: [] } });
    garmin.fetchGarminActivityStreams.mockResolvedValue(raw);

    const stream = await buildMultisportLegStream('athlete-1', runLeg({}), options);

    expect(stream?.stream.available).toBe(true);
    expect(garmin.fetchGarminActivityStreams).toHaveBeenCalledTimes(1);
    expect(prismaMock.activityStream.update).toHaveBeenCalledWith({
      where: { activityId: 'tri' },
      data: { data: expect.objectContaining({ garminLegs: { 'g-run': expect.any(Object) } }) },
    });
  });

  it('never calls a provider in cache-only mode', async () => {
    prismaMock.activityStream.findUnique.mockResolvedValue(null);

    const stream = await buildMultisportLegStream('athlete-1', runLeg({}), {
      ...options,
      cacheOnly: true,
    });

    expect(stream).toBeNull();
    expect(garmin.fetchGarminActivityStreams).not.toHaveBeenCalled();
  });

  it("prefers the leg row's own stored stream when it has a route and distance", async () => {
    const withRoute = {
      ...raw,
      latlng: [
        [48.8, 2.1],
        [48.81, 2.11],
        [48.82, 2.12],
        [48.83, 2.13],
      ],
    };
    prismaMock.activity.findFirst.mockResolvedValue({
      id: 'a-run',
      type: 'RUN',
      duration: 180,
      bikeMetrics: null,
      stream: { available: true, data: withRoute },
    });

    const stream = await buildMultisportLegStream(
      'athlete-1',
      runLeg({ sourceActivityId: 'a-run' }),
      options,
    );

    expect(stream?.stream.has.hr).toBe(true);
    expect(prismaMock.activityStream.findUnique).not.toHaveBeenCalled();
    expect(garmin.fetchGarminActivityStreams).not.toHaveBeenCalled();
  });

  it('takes the cached Garmin leg over an Apple leg row that has heart rate but no route', async () => {
    prismaMock.activity.findFirst.mockResolvedValue({
      id: 'a-run',
      type: 'RUN',
      duration: 180,
      bikeMetrics: null,
      stream: { available: true, data: { ...raw, distance: [] } },
    });
    const garminRun = {
      ...raw,
      latlng: [
        [48.8, 2.1],
        [48.81, 2.11],
        [48.82, 2.12],
        [48.83, 2.13],
      ],
    };
    prismaMock.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: { garminLegs: { 'g-run': garminRun } },
    });

    const stream = await buildMultisportLegStream(
      'athlete-1',
      runLeg({ sourceActivityId: 'a-run' }),
      options,
    );

    expect(stream?.stream.path?.length).toBeGreaterThan(0);
    expect(stream?.stream.has.distance).toBe(true);
    expect(garmin.fetchGarminActivityStreams).not.toHaveBeenCalled();
  });

  it('notes a leg Garmin has no stream for, and skips it for 24 h', async () => {
    prismaMock.activityStream.findUnique.mockResolvedValue({ available: true, data: { time: [] } });
    garmin.fetchGarminActivityStreams.mockResolvedValue(null);

    expect(await buildMultisportLegStream('athlete-1', runLeg({}), options)).toBeNull();
    expect(prismaMock.activityStream.update).toHaveBeenCalledWith({
      where: { activityId: 'tri' },
      data: {
        data: expect.objectContaining({
          garminLegs: { 'g-run': { missingAt: expect.any(String) } },
        }),
      },
    });

    vi.clearAllMocks();
    const missingAt = new Date(Date.now() - 60_000).toISOString();
    prismaMock.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: { garminLegs: { 'g-run': { missingAt } } },
    });
    expect(await buildMultisportLegStream('athlete-1', runLeg({}), options)).toBeNull();
    expect(garmin.fetchGarminActivityStreams).not.toHaveBeenCalled();
  });

  it('asks Garmin again once the missing marker is a day old', async () => {
    const missingAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    prismaMock.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: { garminLegs: { 'g-run': { missingAt } } },
    });
    garmin.fetchGarminActivityStreams.mockResolvedValue(raw);

    const stream = await buildMultisportLegStream('athlete-1', runLeg({}), options);

    expect(stream?.stream.available).toBe(true);
    expect(garmin.fetchGarminActivityStreams).toHaveBeenCalledTimes(1);
  });

  it('does not mark a leg missing when the Garmin call fails', async () => {
    prismaMock.activityStream.findUnique.mockResolvedValue({ available: true, data: { time: [] } });
    garmin.fetchGarminActivityStreams.mockRejectedValue(new Error('timeout'));

    expect(await buildMultisportLegStream('athlete-1', runLeg({}), options)).toBeNull();
    expect(prismaMock.activityStream.update).not.toHaveBeenCalled();
  });
});

describe('persistStream — Garmin leg cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.activity.findFirst.mockResolvedValue(null);
  });

  it('keeps the cached Garmin legs when the parent stream is replaced', async () => {
    const garminLegs = { 'g-run': raw };
    prismaMock.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: { time: [0], garminLegs },
    });

    await persistStream('athlete-1', 'tri', raw);

    const [[written]] = prismaMock.activityStream.upsert.mock.calls;
    expect(written.update.data).toMatchObject({ garminLegs });
    expect(written.create.data).toMatchObject({ garminLegs });
  });
});
