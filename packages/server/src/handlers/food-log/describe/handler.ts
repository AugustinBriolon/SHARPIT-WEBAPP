import { NextRequest, NextResponse } from 'next/server';
import { isProAthlete } from '@sharpit/server/lib/access/is-pro-athlete';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  describeMealFromText,
  FoodDescribeEmptyError,
  FoodDescribeUnavailableError,
} from '@sharpit/server/lib/nutrition/food-log/food-describe';
import {
  foodDescribeRequestSchema,
  portionFromPer100g,
} from '@sharpit/server/lib/nutrition/food-log/food-describe-schema';
import { athleteHasAiProcessingConsent } from '@sharpit/server/lib/privacy/consent-store';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';

/**
 * `POST /api/v1/food-log/describe` — Pro: free-text meal → distinct foods with estimated macros.
 */
export async function POST(request: NextRequest) {
  let athleteId: string;
  try {
    athleteId = await getCurrentAthleteId();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const limited = await checkRateLimit(rateLimiters.foodDescribe, athleteId, { failClosed: true });
  if (!limited.ok) {
    const { body, status } = rateLimitJsonResponse(limited);
    return NextResponse.json(body, { status });
  }

  if (!(await isProAthlete(athleteId))) {
    return NextResponse.json(
      { error: 'Décrire un repas est réservé à SharpIt Pro.' },
      { status: 403 },
    );
  }

  if (!(await athleteHasAiProcessingConsent(athleteId))) {
    return NextResponse.json(
      { error: 'Active le traitement IA dans Confidentialité pour décrire un repas.' },
      { status: 403 },
    );
  }

  const parsed = foodDescribeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Décris ton repas en quelques mots (plats et quantités).' },
      { status: 400 },
    );
  }

  try {
    const result = await describeMealFromText({
      athleteId,
      description: parsed.data.description,
    });
    return NextResponse.json({
      items: result.items.map((item) => ({
        ...portionFromPer100g(item),
        per100g: {
          kcal: item.kcalPer100g,
          protein: item.proteinPer100g,
          carbs: item.carbsPer100g,
          fat: item.fatPer100g,
        },
      })),
    });
  } catch (error) {
    if (error instanceof FoodDescribeEmptyError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof FoodDescribeUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[api/v1/food-log/describe]', error);
    return NextResponse.json(
      { error: 'Impossible de décrire ce repas. Réessaie dans un instant.' },
      { status: 500 },
    );
  }
}
