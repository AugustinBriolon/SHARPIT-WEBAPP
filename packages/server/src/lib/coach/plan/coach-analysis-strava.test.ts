import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateText = vi.fn();
const queries = {
  getActivePhysicalNotes: vi.fn(),
  getAthleteProfile: vi.fn(),
  getBrickEvaluation: vi.fn(),
  getBrickSessions: vi.fn(),
  getPlannedSessionById: vi.fn(),
};

vi.mock('@sharpit/server/lib/ai', () => ({
  COACH_MODEL: 'mock-model',
  coachAnalysisGatewayOptions: {},
}));
vi.mock('ai', () => ({ generateText, Output: { object: (config: unknown) => config } }));
vi.mock('@sharpit/server/lib/queries', () => queries);
vi.mock('@sharpit/db/client', () => ({ prisma: { activityStream: { findUnique: vi.fn() } } }));

beforeEach(() => vi.clearAllMocks());

describe('session analysis and Strava-only activities (ADR-126)', () => {
  it('does not analyse a session whose only record comes from Strava', async () => {
    queries.getPlannedSessionById.mockResolvedValue({
      id: 'p1',
      activity: { id: 'a1', source: 'strava', notes: null, type: 'RUN' },
    });
    const { analyzePlannedSession } = await import('./coach-analysis');

    expect(await analyzePlannedSession('athlete-1', 'p1')).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does not analyse a brick with a Strava-only leg', async () => {
    queries.getBrickSessions.mockResolvedValue([
      { id: 'p1', type: 'BIKE', activity: { id: 'a1', source: 'garmin' } },
      { id: 'p2', type: 'RUN', activity: { id: 'a2', source: 'strava' } },
    ]);
    const { analyzeBrick } = await import('./coach-analysis');

    expect(await analyzeBrick('athlete-1', 'brick-1')).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });
});
