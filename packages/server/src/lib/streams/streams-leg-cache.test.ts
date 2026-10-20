import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';

const prismaMock = vi.hoisted(() => ({
  activity: { findFirst: vi.fn() },
  activityStream: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
}));

vi.mock('@sharpit/db/client', () => ({ prisma: prismaMock }));
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

describe('buildMultisportLegStream — cached legs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.activity.findFirst.mockResolvedValue(null);
  });

  it('reads a leg cached on the parent without network calls', async () => {
    prismaMock.activityStream.findUnique.mockResolvedValue({
      available: true,
      data: { garminLegs: { 'g-run': raw } },
    });

    const stream = await buildMultisportLegStream('athlete-1', runLeg({}), options);

    expect(stream?.stream.available).toBe(true);
  });

  it('never calls a provider in cache-only mode', async () => {
    prismaMock.activityStream.findUnique.mockResolvedValue(null);

    const stream = await buildMultisportLegStream('athlete-1', runLeg({}), {
      ...options,
      cacheOnly: true,
    });

    expect(stream).toBeNull();
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
  });

  it('takes the cached leg over an Apple leg row that has heart rate but no route', async () => {
    prismaMock.activity.findFirst.mockResolvedValue({
      id: 'a-run',
      type: 'RUN',
      duration: 180,
      bikeMetrics: null,
      stream: { available: true, data: { ...raw, distance: [] } },
    });
    const legRun = {
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
      data: { garminLegs: { 'g-run': legRun } },
    });

    const stream = await buildMultisportLegStream(
      'athlete-1',
      runLeg({ sourceActivityId: 'a-run' }),
      options,
    );

    expect(stream?.stream.path?.length).toBeGreaterThan(0);
    expect(stream?.stream.has.distance).toBe(true);
  });
});

describe('persistStream — leg cache preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.activity.findFirst.mockResolvedValue(null);
  });

  it('keeps cached legs when the parent stream is replaced', async () => {
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
