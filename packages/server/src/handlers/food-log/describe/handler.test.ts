import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentAthleteId = vi.fn();
const isProAthlete = vi.fn();
const athleteHasAiProcessingConsent = vi.fn();
const checkRateLimit = vi.fn();
const describeMealFromText = vi.fn();

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({ getCurrentAthleteId }));
vi.mock('@sharpit/server/lib/access/is-pro-athlete', () => ({ isProAthlete }));
vi.mock('@sharpit/server/lib/privacy/consent-store', () => ({ athleteHasAiProcessingConsent }));
vi.mock('@sharpit/server/lib/rate-limit', () => ({
  checkRateLimit,
  rateLimiters: { foodDescribe: {} },
  rateLimitJsonResponse: (result: { retryAfterSeconds: number }) =>
    Response.json(
      { error: 'Trop de requêtes', retryAfterSeconds: result.retryAfterSeconds },
      { status: 429 },
    ),
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/food-describe', () => ({
  describeMealFromText,
  FoodDescribeEmptyError: class FoodDescribeEmptyError extends Error {},
  FoodDescribeUnavailableError: class FoodDescribeUnavailableError extends Error {},
}));

describe('POST /api/v1/food-log/describe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentAthleteId.mockResolvedValue('ath-1');
    isProAthlete.mockResolvedValue(true);
    athleteHasAiProcessingConsent.mockResolvedValue(true);
    checkRateLimit.mockResolvedValue({ ok: true });
  });

  it('returns 403 when the athlete is not Pro', async () => {
    isProAthlete.mockResolvedValue(false);
    const { POST } = await import('./handler');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/food-log/describe', {
        method: 'POST',
        body: JSON.stringify({ description: 'Steak frites et salade verte' }),
      }),
    );
    expect(response.status).toBe(403);
    expect(describeMealFromText).not.toHaveBeenCalled();
  });

  it('returns portion macros scaled from per-100g estimates', async () => {
    describeMealFromText.mockResolvedValue({
      items: [
        {
          name: 'Faux-filet',
          grams: 300,
          kcalPer100g: 200,
          proteinPer100g: 25,
          carbsPer100g: 0,
          fatPer100g: 10,
        },
      ],
    });
    const { POST } = await import('./handler');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/food-log/describe', {
        method: 'POST',
        body: JSON.stringify({ description: 'Faux-filet 300 g avec frites' }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          name: 'Faux-filet',
          grams: 300,
          kcal: 600,
          protein: 75,
          carbs: 0,
          fat: 30,
          per100g: { kcal: 200, protein: 25, carbs: 0, fat: 10 },
        },
      ],
    });
  });
});
