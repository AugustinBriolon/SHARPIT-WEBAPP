import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProviderAuthFailure } from '@sharpit/server/lib/integrations/shared/connection-status';
import {
  createGarminWorkout,
  deleteGarminWorkout,
  GarminWorkoutPushError,
  scheduleGarminWorkout,
} from './garmin-training-api';

function stubFetch(status: number, body: unknown = null) {
  const fetchMock = vi.fn(
    async () => new Response(body === null ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Garmin Training API', () => {
  it('creates a workout with the bearer token and returns its id', async () => {
    const fetchMock = stubFetch(200, { workoutId: 4242 });
    await expect(createGarminWorkout('token', { workoutName: 'Seuil' })).resolves.toBe('4242');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://apis.garmin.com/workoutportal/workout/v2');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(JSON.parse(init.body as string)).toEqual({ workoutName: 'Seuil' });
  });

  it('schedules the workout on a day, with a numeric workout id', async () => {
    const fetchMock = stubFetch(200, { scheduleId: 7 });
    await scheduleGarminWorkout('token', '4242', '2026-10-27');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://apis.garmin.com/training-api/schedule');
    expect(JSON.parse(init.body as string)).toEqual({ workoutId: 4242, date: '2026-10-27' });
  });

  it('deletes a workout by id', async () => {
    const fetchMock = stubFetch(204);
    await deleteGarminWorkout('token', '4242');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://apis.garmin.com/training-api/workout/v2/4242');
    expect(init.method).toBe('DELETE');
  });

  it('asks for a reconnect on 401', async () => {
    stubFetch(401);
    const error = await createGarminWorkout('token', {}).catch((e: unknown) => e);
    expect(isProviderAuthFailure(error)).toBe(true);
  });

  it.each([403, 412])('reads %i as the import permission missing', async (status) => {
    stubFetch(status);
    await expect(createGarminWorkout('token', {})).rejects.toMatchObject({
      code: 'permission',
      status: 403,
    });
  });

  it('reads 429 as Garmin’s daily quota', async () => {
    stubFetch(429);
    const error = await scheduleGarminWorkout('token', '1', '2026-10-27').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GarminWorkoutPushError);
    expect(error).toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('refuses a create answered without a workout id', async () => {
    stubFetch(200, {});
    await expect(createGarminWorkout('token', {})).rejects.toThrow('Garmin workout id absent');
  });
});
