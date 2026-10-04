import { beforeEach, describe, expect, it, vi } from 'vitest';

const athleteFindMany = vi.fn();
const sessionFindMany = vi.fn();
const sessionFindFirst = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: { findMany: athleteFindMany },
    plannedSession: { findMany: sessionFindMany, findFirst: sessionFindFirst },
  },
}));

const { loadOutcomeReport, loadWeekProgress } = await import('./plan-adherence-service');

const planned = (day: string, completed: boolean) => ({
  date: new Date(`${day}T00:00:00.000Z`),
  completed,
  brickGroupId: null,
});

describe('plan adherence service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads this week, Monday on', async () => {
    sessionFindMany.mockResolvedValue([planned('2026-09-28', true), planned('2026-10-02', false)]);
    expect(await loadWeekProgress('a1', '2026-10-01')).toEqual({ done: 1, planned: 2 });
    expect(sessionFindMany.mock.calls[0][0].where.date).toEqual({
      gte: new Date('2026-09-28T00:00:00.000Z'),
      lt: new Date('2026-10-05T00:00:00.000Z'),
    });
  });

  it('reports real athletes over their first four weeks', async () => {
    athleteFindMany.mockResolvedValue([
      { id: 'onboarded', onboardingCompletedAt: new Date('2026-08-01T09:00:00.000Z') },
      { id: 'planner', onboardingCompletedAt: null },
      { id: 'idle', onboardingCompletedAt: null },
    ]);
    sessionFindFirst.mockImplementation(({ where }) =>
      Promise.resolve(
        where.athleteId === 'planner' ? { date: new Date('2026-09-20T00:00:00.000Z') } : null,
      ),
    );
    sessionFindMany.mockImplementation(({ where }) =>
      Promise.resolve(
        where.athleteId === 'onboarded'
          ? [planned('2026-08-02', true), planned('2026-08-09', true), planned('2026-08-16', false)]
          : [planned('2026-09-21', true)],
      ),
    );

    const report = await loadOutcomeReport('2026-10-04');

    expect(athleteFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      clerkUserId: { not: 'demo' },
    });
    expect(
      report.rows.map((row) => [row.athleteId, row.start, row.complete, row.meetsTarget]),
    ).toEqual([
      ['onboarded', '2026-08-01', true, false],
      ['planner', '2026-09-20', false, true],
    ]);
    expect(report).toMatchObject({ finished: 1, meetingTarget: 0, share: 0, target: 0.7 });
  });
});
