import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock('@sharpit/db/client', () => ({ prisma: { activity: { findMany, findFirst } } }));

const NOT_STRAVA_ONLY = { NOT: { source: 'strava' } };

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(null);
});

describe('activities read for AI leave out the Strava-only ones (ADR-126)', () => {
  it('always filters the coach lists and the single coach activity', async () => {
    const { getActivitiesForCoach, getActivityForCoach } = await import('./index');

    await getActivitiesForCoach('a1', { limit: 10 });
    await getActivityForCoach('a1', 'act-1');

    expect(findMany.mock.calls[0][0].where).toMatchObject(NOT_STRAVA_ONLY);
    expect(findFirst.mock.calls[0][0].where).toMatchObject(NOT_STRAVA_ONLY);
  });

  it('filters getActivities only when asked for AI', async () => {
    const { getActivities } = await import('./index');

    await getActivities('a1', { limit: 10 });
    await getActivities('a1', { limit: 10, forAi: true });

    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('NOT');
    expect(findMany.mock.calls[1][0].where).toMatchObject(NOT_STRAVA_ONLY);
  });
});
