import { beforeEach, describe, expect, it, vi } from 'vitest';

const isProAthlete = vi.fn();
const athleteHasAiProcessingConsent = vi.fn();
const plannedSessionFindFirst = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    plannedSession: { findFirst: (...args: unknown[]) => plannedSessionFindFirst(...args) },
  },
}));
vi.mock('@sharpit/server/handlers/coach/plan/handler', () => ({
  generatePlan: vi.fn(),
  prepareScheduledPlan: vi.fn(),
}));
vi.mock('@sharpit/server/handlers/coach/plan/insert/handler', () => ({
  insertGeneratedWeek: vi.fn(),
  parseGeneratedWeek: vi.fn(),
}));
vi.mock('@sharpit/server/lib/coach/plan/plan-jobs', () => ({
  createPlanJob: vi.fn(),
  getPlanJob: vi.fn(),
  updatePlanJob: vi.fn(),
}));
vi.mock('@sharpit/server/lib/health/activity-status-service', () => ({
  getActivityStatusStoreDb: vi.fn().mockResolvedValue({ status: 'active' }),
}));
vi.mock('@sharpit/server/lib/privacy/consent-store', () => ({
  athleteHasAiProcessingConsent: (...args: unknown[]) => athleteHasAiProcessingConsent(...args),
}));
vi.mock('@sharpit/server/lib/access/is-pro-athlete', () => ({
  isProAthlete: (...args: unknown[]) => isProAthlete(...args),
}));
vi.mock('@sharpit/server/lib/notifications/notification-prefs', () => ({
  resolveNotificationPrefs: vi.fn(),
}));
vi.mock('@sharpit/server/lib/push/athlete-push', () => ({ sendPushToAthlete: vi.fn() }));
vi.mock('@sharpit/server/lib/redis', () => ({ redis: null }));
vi.mock('@sharpit/server/lib/locale/locale-context', () => ({
  inAthleteLocale: (_id: string, run: () => unknown) => run(),
}));

const { runPlanHorizonFor } = await import('./plan-horizon');

describe('runPlanHorizonFor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    athleteHasAiProcessingConsent.mockResolvedValue(true);
  });

  it('skips a Free athlete: the automatic week is Pro-only (ADR-097)', async () => {
    isProAthlete.mockResolvedValue(false);

    expect(await runPlanHorizonFor('athlete-1', '2026-10-19')).toBe('skipped');
    expect(plannedSessionFindFirst).not.toHaveBeenCalled();
  });

  it('skips a Pro athlete without the AI consent', async () => {
    isProAthlete.mockResolvedValue(true);
    athleteHasAiProcessingConsent.mockResolvedValue(false);

    expect(await runPlanHorizonFor('athlete-1', '2026-10-19')).toBe('skipped');
    expect(plannedSessionFindFirst).not.toHaveBeenCalled();
  });
});
