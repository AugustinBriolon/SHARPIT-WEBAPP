import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProviderAuthFailure } from '@sharpit/server/lib/integrations/shared/connection-status';
import { GarminApiError, GarminPersonalClient, exchangeGarminApiKey } from './garmin-personal-api';

const KEY = 'gpk_live_secret_1234';

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exchangeGarminApiKey', () => {
  it('posts the key in the ApiKey header and returns the bearer', async () => {
    const fetchMock = stubFetch(new Response('bearer-token\n'));

    await expect(exchangeGarminApiKey(KEY)).resolves.toBe('bearer-token');
    const [[url, init]] = fetchMock.mock.calls;
    expect(String(url)).toBe(
      'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token',
    );
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: `ApiKey ${KEY}` } });
  });

  it('turns a refused key into an auth failure that never quotes the key', async () => {
    stubFetch(new Response('invalid key', { status: 401 }));

    const error = await exchangeGarminApiKey(KEY).catch((caught: unknown) => caught);
    expect(isProviderAuthFailure(error)).toBe(true);
    expect(String((error as Error).message)).not.toContain(KEY);
  });

  it('reports a Garmin outage by status and path only', async () => {
    stubFetch(new Response(`echo ${KEY}`, { status: 503 }));

    const error = await exchangeGarminApiKey(KEY).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GarminApiError);
    expect((error as GarminApiError).status).toBe(503);
    expect((error as Error).message).not.toContain(KEY);
  });
});

describe('GarminPersonalClient', () => {
  it('calls Connect paths on the Personal host with the bearer and query params', async () => {
    const fetchMock = stubFetch(new Response('[{"activityId":1}]'));

    const activities = await new GarminPersonalClient('bearer').getActivities(20, 10);

    expect(activities).toEqual([{ activityId: 1 }]);
    const [[url, init]] = fetchMock.mock.calls;
    expect(String(url)).toBe(
      'https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=20&limit=10',
    );
    expect(init.headers.Authorization).toBe('Bearer bearer');
  });

  it('reads an empty body as null', async () => {
    stubFetch(new Response(''));
    await expect(
      new GarminPersonalClient('bearer').get('/hrv-service/hrv/2026-10-24'),
    ).resolves.toBe(null);
  });

  it('treats an expired bearer as an auth failure', async () => {
    stubFetch(new Response('', { status: 401 }));
    const error = await new GarminPersonalClient('bearer')
      .get('/hrv-service/hrv/2026-10-24')
      .catch((caught: unknown) => caught);
    expect(isProviderAuthFailure(error)).toBe(true);
  });
});
