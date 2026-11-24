import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/server/lib/demo/finalize-demo-seed', () => ({
  finalizeDemoSeed: vi.fn(),
  purgeDemoDerivedState: vi.fn(),
}));

const { seedReviewAthleteHistory } = await import('@sharpit/server/lib/demo/seed-demo-data');

/** A Prisma double that records every write, by model and operation. */
function prismaDouble(existingSessions: number) {
  const writes: string[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_, op: string) =>
          vi.fn(async () => {
            if (op === 'count') {
              return existingSessions;
            }
            writes.push(`${name}.${op}`);
            return { id: `${name}-1` };
          }),
      },
    );
  const prisma = new Proxy({}, { get: (_, name: string) => model(name) });
  return { prisma: prisma as never, writes };
}

describe('seedReviewAthleteHistory', () => {
  it('refuses an athlete that already has sessions, writing nothing', async () => {
    const { prisma, writes } = prismaDouble(3);
    await expect(seedReviewAthleteHistory(prisma, 'a1')).rejects.toThrow('already has sessions');
    expect(writes).toEqual([]);
  });

  it('writes the history and never the profile, goals or plan', async () => {
    const { prisma, writes } = prismaDouble(0);
    await seedReviewAthleteHistory(prisma, 'a1');
    expect(writes).toContain('activity.create');
    expect(writes).toContain('dailyHealth.upsert');
    expect(writes).toContain('athleteDayJournal.create');
    expect(writes).toContain('dailyNutrition.upsert');
    expect(writes.some((w) => /^(athleteProfile|goal|plannedSession)\./.test(w))).toBe(false);
  });
});
