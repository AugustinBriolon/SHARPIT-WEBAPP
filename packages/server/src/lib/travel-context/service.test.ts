import { describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/server/lib/geocoding/nominatim', () => ({
  geocodePlaceLabel: vi.fn(),
  reverseGeocode: vi.fn(),
}));

import { geocodePlaceLabel } from '@sharpit/server/lib/geocoding/nominatim';
import {
  applyTravelContextToUpcomingSessions,
  createTravelContext,
  getActiveTravelContext,
  listActiveTravelContexts,
  listTravelContexts,
  purgeExpiredTravelContexts,
} from './service';

function fakePrisma(overrides: Record<string, unknown> = {}) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'travel-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  }));
  return {
    athleteTravelContext: {
      create,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
    plannedSession: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
  } as never;
}

const ATHLETE_ID = 'default';

describe('createTravelContext', () => {
  it('stores the exact UTC midnight of the requested calendar day, matching the coerced input', async () => {
    const prisma = fakePrisma();

    const travel = await createTravelContext(prisma, ATHLETE_ID, {
      locationLabel: 'Stockholm, Suède',
      locationLat: 59.33,
      locationLng: 18.06,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
    });

    expect(travel.startDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(travel.endDate.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('stores a CONSTRAINT entry with no location and never geocodes', async () => {
    const prisma = fakePrisma();

    const constraint = await createTravelContext(prisma, ATHLETE_ID, {
      type: 'CONSTRAINT',
      label: 'Tendinite genou',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      trainingConstraint: 'REDUCED',
    });

    expect(constraint.locationLabel).toBeNull();
    expect(constraint.locationLat).toBeNull();
    expect(constraint.locationLng).toBeNull();
    expect(constraint.type).toBe('CONSTRAINT');
    expect(geocodePlaceLabel).not.toHaveBeenCalled();
  });

  it('rejects a TRAVEL entry with no location label', async () => {
    const prisma = fakePrisma();

    await expect(
      createTravelContext(prisma, ATHLETE_ID, {
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-10'),
      }),
    ).rejects.toThrow('Un lieu est requis pour un déplacement.');
  });
});

describe('getActiveTravelContext', () => {
  it('filters to TRAVEL entries only, guaranteeing a non-null location for callers', async () => {
    const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      expect(where.type).toBe('TRAVEL');
      return {
        id: 't1',
        type: 'TRAVEL',
        locationLabel: 'Stockholm, Suède',
        locationLat: 59.33,
        locationLng: 18.06,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-10T00:00:00.000Z'),
      };
    });
    const prisma = fakePrisma({ findFirst });

    const result = await getActiveTravelContext(prisma, ATHLETE_ID, new Date('2026-08-05'));

    expect(result?.locationLabel).toBe('Stockholm, Suède');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('listActiveTravelContexts', () => {
  it('returns every TRAVEL overlapping the day', async () => {
    const findMany = vi.fn(async () => [
      {
        id: 't1',
        type: 'TRAVEL',
        locationLabel: 'Colombes',
        locationLat: 48.92,
        locationLng: 2.25,
        startDate: new Date('2026-07-12T00:00:00.000Z'),
        endDate: new Date('2026-07-19T00:00:00.000Z'),
      },
      {
        id: 't2',
        type: 'TRAVEL',
        locationLabel: 'Les Sables',
        locationLat: 46.49,
        locationLng: -1.78,
        startDate: new Date('2026-07-15T00:00:00.000Z'),
        endDate: new Date('2026-07-22T00:00:00.000Z'),
      },
    ]);
    const prisma = fakePrisma({ findMany });

    const result = await listActiveTravelContexts(prisma, ATHLETE_ID, new Date('2026-07-16'));

    expect(result).toHaveLength(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ athleteId: ATHLETE_ID, type: 'TRAVEL' }),
      }),
    );
  });
});

describe('purgeExpiredTravelContexts', () => {
  it('deletes rows whose endDate is strictly before today', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = fakePrisma({ deleteMany });

    const count = await purgeExpiredTravelContexts(
      prisma,
      ATHLETE_ID,
      new Date('2026-07-22T15:00:00.000Z'),
    );

    expect(count).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        athleteId: ATHLETE_ID,
        endDate: { lt: new Date('2026-07-22T00:00:00.000Z') },
        type: { in: ['TRAVEL', 'CONSTRAINT', 'INJURY'] },
      },
    });
  });
});

describe('listTravelContexts', () => {
  it('purges expired rows then returns only endDate >= today, ascending by start', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'future',
        endDate: new Date('2026-08-01T00:00:00.000Z'),
        startDate: new Date('2026-07-25T00:00:00.000Z'),
      },
    ]);
    const prisma = fakePrisma({ deleteMany, findMany });

    const result = await listTravelContexts(
      prisma,
      ATHLETE_ID,
      new Date('2026-07-22T12:00:00.000Z'),
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        athleteId: ATHLETE_ID,
        endDate: { lt: new Date('2026-07-22T00:00:00.000Z') },
        type: { in: ['TRAVEL', 'CONSTRAINT', 'INJURY'] },
      },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { athleteId: ATHLETE_ID, endDate: { gte: new Date('2026-07-22T00:00:00.000Z') } },
      orderBy: [{ startDate: 'asc' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('future');
  });
});

describe('applyTravelContextToUpcomingSessions', () => {
  it('never pushes location onto planned sessions for a CONSTRAINT entry', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'c1',
      type: 'CONSTRAINT',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-10T00:00:00.000Z'),
      locationLabel: null,
      locationLat: null,
      locationLng: null,
    });
    const prisma = fakePrisma({ findFirst });

    const updated = await applyTravelContextToUpcomingSessions(prisma, ATHLETE_ID, 'c1');

    expect(updated).toBe(0);
    expect(
      (prisma as never as { plannedSession: { findMany: ReturnType<typeof vi.fn> } }).plannedSession
        .findMany,
    ).not.toHaveBeenCalled();
  });
});
