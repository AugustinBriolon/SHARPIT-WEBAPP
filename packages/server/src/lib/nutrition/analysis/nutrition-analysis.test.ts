import { beforeEach, describe, expect, it, vi } from 'vitest';

const READING = {
  verdict: { headline: 'Bonne journée de carburant', tone: 'on_track' },
  findings: [{ job: 'fuel', text: '5,6 g/kg de glucides pour une sortie modérée.' }],
  action: { text: 'Garde ce petit-déjeuner avant la séance de demain.' },
  flaggedEntries: [],
};

/** A reading stored for the day before the athlete edited it: its hash no longer matches. */
const STALE_ROW = {
  status: 'FINAL',
  inputHash: 'before-edit',
  analysis: READING,
  generatedAt: new Date('2026-09-11T07:00:00.000Z'),
  attemptHash: 'before-edit',
  attemptedAt: new Date('2026-09-11T06:59:00.000Z'),
};

vi.mock('@sharpit/server/lib/ai', () => ({
  COACH_MODEL: 'test-model',
  coachAnalysisGatewayOptions: {},
  isCoachConfigured: () => true,
}));
vi.mock('@sharpit/server/lib/privacy/consent-store', () => ({
  athleteHasAiProcessingConsent: vi.fn(async () => true),
  isDemoAthlete: vi.fn(async () => false),
}));
vi.mock('./nutrition-analysis-inputs', () => ({
  loadNutritionAnalysisInput: vi.fn(async () => ({})),
}));
vi.mock('./nutrition-analysis-facts', () => ({ buildNutritionAnalysisFacts: vi.fn(() => ({})) }));
vi.mock('./nutrition-analysis-hash', () => ({ nutritionAnalysisInputHash: () => 'after-edit' }));
vi.mock('./nutrition-analysis-store', () => ({
  findNutritionAnalysisRow: vi.fn(),
  claimNutritionAnalysis: vi.fn(async () => true),
  saveNutritionAnalysis: vi.fn(),
}));
vi.mock('@sharpit/server/lib/rate-limit', () => ({
  rateLimiters: { nutritionReading: 'nutrition-reading' },
  checkRateLimit: vi.fn(),
}));

const NOW = new Date('2026-09-12T10:00:00');

async function prepare(row: typeof STALE_ROW | null) {
  const { findNutritionAnalysisRow } = await import('./nutrition-analysis-store');
  vi.mocked(findNutritionAnalysisRow).mockResolvedValue(row as never);
  const { prepareNutritionCoachReading } = await import('./nutrition-analysis');
  return prepareNutritionCoachReading('athlete-1', '2026-09-11', NOW);
}

async function givenLimit(ok: boolean) {
  const { checkRateLimit } = await import('@sharpit/server/lib/rate-limit');
  vi.mocked(checkRateLimit).mockResolvedValue(
    ok ? { ok: true } : { ok: false, cause: 'limited', retryAfterSeconds: 600 },
  );
  return checkRateLimit;
}

describe('prepareNutritionCoachReading · per-athlete budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves the last stored reading, without generating, once the budget is spent', async () => {
    const checkRateLimit = await givenLimit(false);
    const { claimNutritionAnalysis } = await import('./nutrition-analysis-store');

    const prepared = await prepare(STALE_ROW);

    expect(checkRateLimit).toHaveBeenCalledWith('nutrition-reading', 'athlete-1', {
      failClosed: true,
    });
    expect(prepared.generate).toBeNull();
    expect(prepared.view).toMatchObject({
      state: 'ready',
      refreshing: false,
      verdict: READING.verdict,
    });
    expect(claimNutritionAnalysis).not.toHaveBeenCalled();
  });

  it('answers no reading rather than an error when nothing is stored yet', async () => {
    await givenLimit(false);
    expect(await prepare(null)).toEqual({ view: null, generate: null });
  });

  it('regenerates while under the budget', async () => {
    await givenLimit(true);
    const prepared = await prepare(STALE_ROW);
    expect(prepared.generate).toBeTypeOf('function');
    expect(prepared.view).toMatchObject({ state: 'ready', refreshing: true });
  });
});
