import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subDays } from 'date-fns';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  buildFacts: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn(() => ({})) },
}));
vi.mock('@sharpit/server/lib/ai', () => ({
  COACH_MODEL: 'model',
  coachAnalysisGatewayOptions: {},
  isCoachConfigured: () => true,
}));
vi.mock('@sharpit/server/lib/ai/usage', () => ({ recordAiUsage: vi.fn() }));
vi.mock('@sharpit/server/lib/access/narrative-trial', () => ({
  canGenerateNarrativeForActivity: vi.fn().mockResolvedValue({ allowed: true, isPro: true }),
}));
vi.mock('@sharpit/server/lib/activity/narrative/activity-narrative-facts', () => ({
  buildActivityNarrativeFacts: mocks.buildFacts,
}));
vi.mock('@sharpit/server/lib/analysis/analysis-run-store', () => ({
  withAnalysisRun: (_run: unknown, work: () => Promise<void>) => work(),
}));
vi.mock('@sharpit/db/client', () => ({
  prisma: { activity: { findFirst: mocks.findFirst, update: mocks.update } },
}));

import { runActivityNarrativeAnalysis } from '@sharpit/server/lib/activity/narrative/activity-narrative';

/** Shaped like the prod race: a Garmin triathlon from a few days ago, never analyzed. */
const pastTriathlon = {
  type: 'TRIATHLON',
  date: subDays(new Date(), 3),
  narrativeAnalyzedAt: null,
  narrativeAnalysis: null,
};

describe('runActivityNarrativeAnalysis — a past triathlon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(pastTriathlon);
    mocks.buildFacts.mockResolvedValue('# Cette séance\nSport : Triathlon');
    mocks.generateText.mockResolvedValue({
      output: { headline: 'Course maîtrisée', narrative: 'Bon départ.' },
      usage: {},
    });
  });

  it('stays out of the automatic path once its day is over', async () => {
    expect(await runActivityNarrativeAnalysis('athlete-1', 'tri')).toBe(false);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('is generated when the athlete asks for it', async () => {
    const created = await runActivityNarrativeAnalysis('athlete-1', 'tri', {
      force: false,
      allowHistorical: true,
    });

    expect(created).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          narrativeAnalysis: { headline: 'Course maîtrisée', narrative: 'Bon départ.' },
        }),
      }),
    );
  });
});

describe('runActivityNarrativeAnalysis — a strength session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      type: 'STRENGTH',
      date: new Date(),
      narrativeAnalyzedAt: null,
      narrativeAnalysis: null,
    });
    mocks.buildFacts.mockResolvedValue('# Cette séance\nSport : Renforcement');
    mocks.generateText.mockResolvedValue({
      output: { headline: 'Volume tenu', narrative: 'Charges stables.' },
      usage: {},
    });
  });

  it('is not read on import, so imports do not spend tokens on it', async () => {
    expect(await runActivityNarrativeAnalysis('athlete-1', 'strength')).toBe(false);
    expect(mocks.buildFacts).not.toHaveBeenCalled();
  });

  it('is read when the athlete asks for it', async () => {
    const created = await runActivityNarrativeAnalysis('athlete-1', 'strength', {
      allowHistorical: true,
      onRequest: true,
    });

    expect(created).toBe(true);
    expect(mocks.generateText).toHaveBeenCalled();
  });
});
