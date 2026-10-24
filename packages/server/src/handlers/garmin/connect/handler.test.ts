import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decryptSecret, encryptSecret } from '@sharpit/server/lib/secret-box';

const upsertMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));
vi.mock('@sharpit/server/lib/privacy/gate-provider-connect', () => ({
  gateProviderConnect: vi.fn().mockResolvedValue(null),
}));
vi.mock('@sharpit/server/lib/integrations/source-prefs-store', () => ({
  persistSourcePrefsMutation: vi.fn(),
  loadResolvedSourcePrefs: vi.fn(),
}));
vi.mock('@sharpit/db/client', () => ({
  prisma: { garminAccount: { upsert: upsertMock, findUnique: findUniqueMock } },
}));

const KEY = 'gpk_live_secret_1234';
const ORIGINAL_ALLOWLIST = process.env.GARMIN_PERSONAL_KEY_ATHLETES;

function connect(body: unknown) {
  return new NextRequest('https://api.sharpit.app/api/v1/garmin/connect', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Garmin accepts the key, then answers the profile read. */
function stubGarminAccepts() {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response('bearer'))
      .mockResolvedValueOnce(new Response('{"displayName":"Augustin"}')),
  );
}

beforeEach(() => {
  process.env.SECRET_ENCRYPTION_KEY = 'garmin-connect-test-key';
  process.env.GARMIN_PERSONAL_KEY_ATHLETES = 'athlete-1';
  upsertMock.mockReset();
});

afterEach(() => {
  process.env.GARMIN_PERSONAL_KEY_ATHLETES = ORIGINAL_ALLOWLIST;
  vi.unstubAllGlobals();
});

describe('POST /api/v1/garmin/connect', () => {
  it('refuses athletes outside the allowlist before reading the key', async () => {
    process.env.GARMIN_PERSONAL_KEY_ATHLETES = 'someone-else';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./handler');

    expect((await POST(connect({ apiKey: KEY }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects a missing key', async () => {
    const { POST } = await import('./handler');
    expect((await POST(connect({}))).status).toBe(400);
  });

  it('stores nothing when Garmin refuses the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const { POST } = await import('./handler');

    const response = await POST(connect({ apiKey: KEY }));

    expect(response.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(KEY);
  });

  it('stores the key encrypted and answers with its last four characters only', async () => {
    stubGarminAccepts();
    const { POST } = await import('./handler');

    const response = await POST(connect({ apiKey: KEY }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ success: true, apiKeyLast4: '1234' });
    expect(text).not.toContain(KEY);

    const stored = upsertMock.mock.calls[0][0].create;
    expect(stored.apiKeyEnc).not.toContain(KEY);
    expect(decryptSecret(stored.apiKeyEnc)).toBe(KEY);
    expect(stored).toMatchObject({ athleteId: 'athlete-1', apiKeyLast4: '1234' });
  });
});

describe('GET /api/v1/garmin/connect', () => {
  it('shows the masked key, never the stored one', async () => {
    const apiKeyEnc = encryptSecret(KEY);
    findUniqueMock.mockResolvedValue({ apiKeyEnc, apiKeyLast4: '1234', lastSyncAt: null });
    const { GET } = await import('./handler');

    const text = await (await GET()).text();

    expect(JSON.parse(text)).toEqual({
      available: true,
      connected: true,
      apiKeyLast4: '1234',
      lastSyncAt: null,
    });
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(apiKeyEnc);
  });

  it('is unavailable to athletes outside the allowlist without a key', async () => {
    process.env.GARMIN_PERSONAL_KEY_ATHLETES = '';
    findUniqueMock.mockResolvedValue(null);
    const { GET } = await import('./handler');

    expect(await (await GET()).json()).toMatchObject({ available: false, connected: false });
  });
});
