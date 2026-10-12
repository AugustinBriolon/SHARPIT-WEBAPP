import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));

vi.mock('@sharpit/server/lib/queries', () => ({
  getAthleteProfile: vi.fn(),
}));

vi.mock('@sharpit/server/lib/coach/chat/discuss/coach-discuss-day-scores', () => ({
  loadTodayDiscussBlock: vi.fn().mockResolvedValue('TODAY BLOCK'),
  loadMorningBriefDiscussBlock: vi.fn().mockResolvedValue('MORNING BRIEF BLOCK'),
}));

vi.mock('@sharpit/server/lib/coach/chat/discuss/coach-discuss-target-blocks', () => ({
  formatPlanningDiscussBlock: vi.fn(() => 'PLANNING BLOCK'),
  loadPlannedSessionDiscussBlock: vi.fn().mockResolvedValue('SESSION BLOCK'),
  loadActivityDiscussBlock: vi.fn().mockResolvedValue('ACTIVITY BLOCK'),
  loadGoalDiscussBlock: vi.fn().mockResolvedValue('GOAL BLOCK'),
  loadRecordDiscussBlock: vi.fn().mockResolvedValue('RECORD BLOCK'),
  loadPhysicalConditionDiscussBlock: vi.fn().mockResolvedValue('CONDITION BLOCK'),
}));

vi.mock('@sharpit/server/lib/coach/chat/discuss/journal-analyses-coach-gate', () => ({
  JOURNAL_ANALYSES_PRO_REQUIRED_ERROR: 'La lecture coach du journal est réservée à Pro.',
  loadJournalAnalysesCoachBlock: vi.fn().mockResolvedValue('JOURNAL BLOCK'),
}));

const ATHLETE = 'athlete-1';
const NOW = new Date(2026, 8, 10, 8, 0);

function conversation(...metadata: unknown[]) {
  return metadata.map((entry) => ({ role: 'user', parts: [], metadata: entry }));
}

async function resolve(messages: unknown) {
  const { resolveCoachDiscussServerContext } =
    await import('@sharpit/server/lib/coach/chat/discuss/coach-discuss-server-context');
  return resolveCoachDiscussServerContext(ATHLETE, messages, NOW);
}

async function loadedBlock(messages: unknown): Promise<string | null> {
  const context = await resolve(messages);
  if (context.status !== 'allowed') {
    throw new Error(`expected an allowed context, got ${context.status}`);
  }
  return context.loadBlock();
}

async function givenTier(tier: 'FREE' | 'PRO') {
  const { getAthleteProfile } = await import('@sharpit/server/lib/queries');
  vi.mocked(getAthleteProfile).mockResolvedValue({ tier } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveCoachDiscussServerContext', () => {
  it('adds nothing to an ordinary conversation and skips the tier lookup', async () => {
    const { getAthleteProfile } = await import('@sharpit/server/lib/queries');

    expect(await loadedBlock([{ role: 'user', parts: [] }])).toBeNull();
    expect(getAthleteProfile).not.toHaveBeenCalled();
  });

  it.each([
    [{ discussKind: 'today' }, 'TODAY BLOCK'],
    [{ discussKind: 'morning-brief', trainingDayId: '2026-09-10' }, 'MORNING BRIEF BLOCK'],
    [{ discussKind: 'planning', horizonDays: 7 }, 'PLANNING BLOCK'],
    [{ discussKind: 'planned-session', sessionId: 's-1' }, 'SESSION BLOCK'],
    [{ discussKind: 'activity', activityId: 'a-1' }, 'ACTIVITY BLOCK'],
    [{ discussKind: 'goal', goalId: 'g-1' }, 'GOAL BLOCK'],
    [{ discussKind: 'record', categoryKey: 'run-distance' }, 'RECORD BLOCK'],
    [{ discussKind: 'physical-condition', noteId: 'n-1' }, 'CONDITION BLOCK'],
  ])('routes %o to its block', async (metadata, expected) => {
    expect(await loadedBlock(conversation(metadata))).toBe(expected);
  });

  it('scopes target loaders to the server-resolved athlete', async () => {
    const blocks =
      await import('@sharpit/server/lib/coach/chat/discuss/coach-discuss-target-blocks');

    await loadedBlock(conversation({ discussKind: 'goal', goalId: 'g-1', athleteId: 'other' }));

    expect(blocks.loadGoalDiscussBlock).toHaveBeenCalledWith(ATHLETE, 'g-1', NOW);
  });

  it('ignores malformed metadata without loading anything', async () => {
    const blocks =
      await import('@sharpit/server/lib/coach/chat/discuss/coach-discuss-target-blocks');

    expect(await loadedBlock(conversation({ discussKind: 'goal', goalId: 42 }))).toBeNull();
    expect(await loadedBlock(conversation({ discussKind: 'dashboard' }))).toBeNull();
    expect(blocks.loadGoalDiscussBlock).not.toHaveBeenCalled();
  });

  it('refuses journal analyses to a FREE athlete before loading findings', async () => {
    await givenTier('FREE');
    const { loadJournalAnalysesCoachBlock } =
      await import('@sharpit/server/lib/coach/chat/discuss/journal-analyses-coach-gate');

    expect(await resolve(conversation({ discussKind: 'journal-analyses' }))).toEqual({
      status: 'forbidden',
      error: 'La lecture coach du journal est réservée à Pro.',
    });
    expect(loadJournalAnalysesCoachBlock).not.toHaveBeenCalled();
  });

  it('hands a PRO athlete their journal reading', async () => {
    await givenTier('PRO');

    expect(await loadedBlock(conversation({ discussKind: 'journal-analyses' }))).toBe(
      'JOURNAL BLOCK',
    );
  });

  it('follows the latest attached context', async () => {
    const { getAthleteProfile } = await import('@sharpit/server/lib/queries');

    const block = await loadedBlock(
      conversation({ discussKind: 'journal-analyses' }, { discussKind: 'goal', goalId: 'g-1' }),
    );

    expect(block).toBe('GOAL BLOCK');
    expect(getAthleteProfile).not.toHaveBeenCalled();
  });

  it('degrades to no block when a loader fails', async () => {
    const blocks =
      await import('@sharpit/server/lib/coach/chat/discuss/coach-discuss-target-blocks');
    vi.mocked(blocks.loadActivityDiscussBlock).mockRejectedValueOnce(new Error('db down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(
      await loadedBlock(conversation({ discussKind: 'activity', activityId: 'a-1' })),
    ).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
