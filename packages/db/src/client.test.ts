import { describe, expect, it, vi } from 'vitest';

describe('prisma client', () => {
  it('refuses an unscoped read of athlete data before it reaches the database', async () => {
    // Nothing listens here: the guard has to answer first.
    vi.stubEnv('DATABASE_URL', 'postgresql://guard:guard@127.0.0.1:1/guard');
    vi.stubEnv('PRISMA_NEON_ADAPTER', 'false');
    const { prisma } = await import('./client');

    expect('condition' in prisma).toBe(true);
    await expect(prisma.condition.findMany()).rejects.toThrow(
      '[athlete-scope] Condition.findMany without an athleteId filter',
    );
  });
});
