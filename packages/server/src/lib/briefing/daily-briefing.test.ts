import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const upsert = vi.fn();
const generateText = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: { dailyBriefing: { findUnique: (...args: unknown[]) => findUnique(...args), upsert } },
}));
vi.mock('ai', () => ({ generateText: (...args: unknown[]) => generateText(...args) }));

const { generateAndStoreDailyBriefing, isBriefingFresh } = await import('./daily-briefing');

describe('isBriefingFresh', () => {
  const now = new Date('2026-10-18T10:00:00Z');

  it('keeps a briefing written within the interval', () => {
    expect(isBriefingFresh(new Date('2026-10-18T09:50:00Z'), now, 15)).toBe(true);
  });

  it('regenerates one older than the interval', () => {
    expect(isBriefingFresh(new Date('2026-10-18T09:40:00Z'), now, 15)).toBe(false);
  });
});

describe('generateAndStoreDailyBriefing', () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    generateText.mockReset();
  });

  // A history import syncs in batches: each batch used to ask the model again (ADR-092).
  it('keeps a briefing written minutes ago instead of asking the model again', async () => {
    const stored = {
      athleteId: 'a1',
      content: 'Bilan',
      generatedAt: new Date(Date.now() - 60_000),
    };
    findUnique.mockResolvedValue(stored);

    const result = await generateAndStoreDailyBriefing('a1', new Date(), {
      minIntervalMinutes: 15,
    });

    expect(result).toBe(stored);
    expect(generateText).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
