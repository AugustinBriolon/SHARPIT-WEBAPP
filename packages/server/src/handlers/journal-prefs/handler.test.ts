import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { defaultJournalPrefs } from '@sharpit/app/lib/journal/journal-prefs';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/app/lib/next/await-request', () => ({
  awaitRequest: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-lea-demo'),
}));
vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: {
      findUnique: vi.fn().mockResolvedValue({ journalPrefs: null, tier: 'FREE' }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

const URL = 'https://api.sharpit.app/api/v1/journal-prefs';
const db = () => import('@sharpit/db/client');

describe('PUT /api/v1/journal-prefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('accepts a valid prefs payload', async () => {
    const { PUT } = await import('./handler');
    const prefs = defaultJournalPrefs();

    const response = await PUT(
      new NextRequest(URL, {
        method: 'PUT',
        body: JSON.stringify({ prefs }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.prefs.version).toBe(2);
    expect((await db()).prisma.athleteProfile.update).toHaveBeenCalled();
  });

  it('rejects an unknown key', async () => {
    const { PUT } = await import('./handler');
    const prefs = defaultJournalPrefs();

    const response = await PUT(
      new NextRequest(URL, {
        method: 'PUT',
        body: JSON.stringify({ prefs, hack: true }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('JOURNAL_PREFS_UNKNOWN_KEY');
    expect((await db()).prisma.athleteProfile.update).not.toHaveBeenCalled();
  });

  it('rejects invalid types', async () => {
    const { PUT } = await import('./handler');
    const prefs = defaultJournalPrefs();

    const response = await PUT(
      new NextRequest(URL, {
        method: 'PUT',
        body: JSON.stringify({
          prefs: { ...prefs, thresholds: { ...prefs.thresholds, steps: 'nope' } },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('JOURNAL_PREFS_INVALID_TYPE');
  });
});
