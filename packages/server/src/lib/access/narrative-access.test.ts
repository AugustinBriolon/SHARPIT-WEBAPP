import { describe, expect, it, vi } from 'vitest';

const isProAthlete = vi.fn();

vi.mock('@sharpit/server/lib/access/is-pro-athlete', () => ({
  isProAthlete: (...args: unknown[]) => isProAthlete(...args),
}));

const { canGenerateNarrativeForActivity } = await import('./narrative-access');

describe('canGenerateNarrativeForActivity', () => {
  it('lets a Pro athlete have every session analysed', async () => {
    isProAthlete.mockResolvedValueOnce(true);
    expect(await canGenerateNarrativeForActivity('athlete-1')).toEqual({
      allowed: true,
      isPro: true,
    });
  });

  it('gives a Free athlete no analysis at all: no daily taste since ADR-097', async () => {
    isProAthlete.mockResolvedValueOnce(false);
    expect(await canGenerateNarrativeForActivity('athlete-1')).toEqual({
      allowed: false,
      isPro: false,
    });
  });
});
