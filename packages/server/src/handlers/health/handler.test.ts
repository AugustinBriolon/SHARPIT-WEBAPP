import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@sharpit/server/lib/queries', () => ({ getHealthEntries: vi.fn().mockResolvedValue([]) }));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));

describe('GET /api/health', () => {
  it('clamps ?days= to ten years', async () => {
    const { getHealthEntries } = await import('@sharpit/server/lib/queries');
    const { GET, MAX_HEALTH_DAYS } = await import('./handler');

    await GET(new NextRequest('http://localhost/api/health?days=1000000'));

    expect(vi.mocked(getHealthEntries).mock.calls[0]![1]).toBe(MAX_HEALTH_DAYS);
  });
});
