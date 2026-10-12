import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActivityById: vi.fn(),
  loadRaceAnalysis: vi.fn(),
}));

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));
vi.mock('@sharpit/server/lib/queries', () => ({
  getActivityById: mocks.getActivityById,
  getActivePhysicalNotes: vi.fn(),
  getAthleteProfile: vi.fn(),
}));
vi.mock('@sharpit/server/lib/activity/multisport/load-race-analysis', () => ({
  loadRaceAnalysis: mocks.loadRaceAnalysis,
}));

import { loadRaceLines } from '@sharpit/server/lib/activity/narrative/activity-narrative-facts';

describe('loadRaceLines — provider access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadRaceAnalysis.mockResolvedValue(null);
  });

  it('lets a triathlon fetch its leg streams once', async () => {
    const detail = { id: 'tri', type: 'TRIATHLON', goal: null };
    mocks.getActivityById.mockResolvedValue(detail);

    await loadRaceLines('athlete-1', 'tri');

    expect(mocks.loadRaceAnalysis).toHaveBeenCalledWith('athlete-1', detail, { cacheOnly: false });
  });

  it('keeps a single-sport race cache-only', async () => {
    const detail = { id: 'run', type: 'RUN', goal: { title: '10 km' } };
    mocks.getActivityById.mockResolvedValue(detail);

    await loadRaceLines('athlete-1', 'run');

    expect(mocks.loadRaceAnalysis).toHaveBeenCalledWith('athlete-1', detail, { cacheOnly: true });
  });
});
