import { NextRequest, NextResponse } from 'next/server';
import { isProAthlete } from '@sharpit/server/lib/access/is-pro-athlete';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { loadDeclaredDiet } from '@sharpit/server/lib/nutrition/analysis/nutrition-analysis-inputs';
import {
  describeMealFromText,
  FoodDescribeEmptyError,
  FoodDescribeUnavailableError,
} from '@sharpit/server/lib/nutrition/food-log/food-describe';
import { resolveDescribedFoods } from '@sharpit/server/lib/nutrition/food-log/food-describe-resolve';
import {
  foodDescribeRequestSchema,
  portionFromPer100g,
  type FoodDescribeItem,
} from '@sharpit/server/lib/nutrition/food-log/food-describe-schema';
import { servedProduct } from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import { athleteHasAiProcessingConsent } from '@sharpit/server/lib/privacy/consent-store';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import type { FoodProduct } from '@prisma/client';

/**
 * `POST /api/v1/food-log/describe` — Pro: free-text meal → distinct foods, matched to known
 * products when the name is confident (eaten → own → Ciqual → OFF), else estimated macros.
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
    const [resolved, diets] = await Promise.all([
      resolveDescribedFoods(athleteId, result.items),
      loadDeclaredDiet(athleteId),
    ]);
    return NextResponse.json({
      items: resolved.map(({ item, product, match }) =>
        serializeDescribedItem(item, product, match, diets),
      ),
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

function serializeDescribedItem(
  item: FoodDescribeItem,
  product: FoodProduct | null,
  match: string | null,
  diets: Parameters<typeof servedProduct>[1],
) {
  const estimated = portionFromPer100g(item);
  if (!product) {
    return {
      ...estimated,
      per100g: {
        kcal: item.kcalPer100g,
        protein: item.proteinPer100g,
        carbs: item.carbsPer100g,
        fat: item.fatPer100g,
      },
      product: null,
      match: null,
    };
  }
  const factor = item.grams / 100;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    name: product.name,
    grams: estimated.grams,
    kcal: Math.round(product.kcalPer100g * factor),
    protein: round1(product.proteinPer100g * factor),
    carbs: round1(product.carbsPer100g * factor),
    fat: round1(product.fatPer100g * factor),
    per100g: {
      kcal: product.kcalPer100g,
      protein: product.proteinPer100g,
      carbs: product.carbsPer100g,
      fat: product.fatPer100g,
    },
    product: servedProduct(product, diets),
    match,
  };
}
