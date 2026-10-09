import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@sharpit/app/lib/next/await-request', () => ({
  awaitRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn(),
}));

vi.mock('@sharpit/server/lib/privacy/account-deletion', () => ({
  deleteAthleteAccount: vi.fn(),
}));

vi.mock('@sharpit/server/lib/privacy/safe-log', () => ({
  logSafeError: vi.fn(),
}));

import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { deleteAthleteAccount } from '@sharpit/server/lib/privacy/account-deletion';
import { POST, PRIVACY_DELETE_CONFIRMATION } from './handler';

function post(body: unknown) {
  return new NextRequest('https://sharpit.app/api/privacy/delete', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/privacy/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a silent POST without the typed confirmation', async () => {
    const response = await POST(post({}));
    expect(response.status).toBe(400);
    expect(deleteAthleteAccount).not.toHaveBeenCalled();
  });

  it('deletes when the confirmation literal matches', async () => {
    vi.mocked(getCurrentAthleteId).mockResolvedValueOnce('ath-1');
    vi.mocked(deleteAthleteAccount).mockResolvedValueOnce({
      deletedAt: new Date('2026-10-09T10:00:00.000Z'),
    } as never);

    const response = await POST(post({ confirmation: PRIVACY_DELETE_CONFIRMATION }));
    expect(response.status).toBe(200);
    expect(deleteAthleteAccount).toHaveBeenCalledWith('ath-1');
  });
});
