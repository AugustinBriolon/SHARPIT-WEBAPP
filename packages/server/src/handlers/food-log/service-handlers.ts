import { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import {
  customFoodSchema,
  customFoodUpdateSchema,
  foodLogEntryCreateSchema,
  foodLogEntryUpdateSchema,
  nutritionTargetsSchema,
} from '@sharpit/app/lib/validators/food-log';
import { isBarcode } from '@sharpit/app/lib/nutrition/food-log/open-food-facts';
import { foodLogDayHealth } from '@sharpit/app/lib/nutrition/food-log/meal-health-score';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  addFoodLogEntry,
  cacheGenericFoods,
  cacheSearchResults,
  createCustomFood,
  deleteCustomFood,
  deleteFoodLogEntry,
  findProductByBarcode,
  FoodLogNotFoundError,
  getNutritionTargets,
  listFoodLogDay,
  listOwnFoods,
  recentFoods,
  searchEatenFoods,
  searchOwnFoods,
  servedProduct,
  setNutritionTargets,
  updateCustomFood,
  updateFoodLogEntry,
} from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import { searchOffProducts } from '@sharpit/server/lib/nutrition/food-log/open-food-facts-client';
import { searchCiqualFoods } from '@sharpit/server/lib/nutrition/food-log/ciqual-search';
import { loadDeclaredDiet } from '@sharpit/server/lib/nutrition/analysis/nutrition-analysis-inputs';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';

/**
 * The in-app food log (ADR-061): entries, foods (Open Food Facts and the athlete's own), and
 * targets. The log is the athlete's own data, open to every tier; only the coach's reading of it
 * is Pro.
 */

const DAY_ID = /^\d{4}-\d{2}-\d{2}$/;

async function parseBody<T>(request: NextRequest, schema: ZodType<T>) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return parsed.success
    ? { ok: true as const, data: parsed.data }
    : {
        ok: false as const,
        response: NextResponse.json(
          { error: 'Saisie invalide', details: parsed.error.flatten() },
          { status: 400 },
        ),
      };
}

function failure(tag: string, error: unknown) {
  if (error instanceof FoodLogNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(`[api/v1/food-log] ${tag}`, error);
  return NextResponse.json({ error: 'Journal alimentaire indisponible' }, { status: 500 });
}

/**
 * `GET /api/v1/food-log?trainingDayId=` — the day's entries, the score of each meal and of the day
 * (ADR-070), the targets and recent foods.
 */
export async function getDay(request: NextRequest) {
  const trainingDayId = request.nextUrl.searchParams.get('trainingDayId');
  if (!trainingDayId || !DAY_ID.test(trainingDayId)) {
    return NextResponse.json({ error: 'trainingDayId requis (YYYY-MM-DD)' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    const diets = loadDeclaredDiet(athleteId);
    const [entries, targets, recent, declared] = await Promise.all([
      diets.then((declared) => listFoodLogDay(athleteId, trainingDayId, declared)),
      getNutritionTargets(athleteId),
      recentFoods(athleteId),
      diets,
    ]);
    return NextResponse.json({
      trainingDayId,
      entries,
      health: foodLogDayHealth(entries),
      targets,
      recent: recent.map((item) => ({ ...item, product: servedProduct(item.product, declared) })),
    });
  } catch (error) {
    return failure('day', error);
  }
}

/** `POST /api/v1/food-log` — logs a product portion or a quick add. */
export async function addEntry(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, foodLogEntryCreateSchema);
    if (!body.ok) {
      return body.response;
    }
    const diets = await loadDeclaredDiet(athleteId);
    return NextResponse.json(
      { entry: await addFoodLogEntry(athleteId, body.data, diets) },
      { status: 201 },
    );
  } catch (error) {
    return failure('add', error);
  }
}

/** `PATCH /api/v1/food-log/[id]` — a new portion or meal. */
export async function updateEntry(request: NextRequest, id: string) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, foodLogEntryUpdateSchema);
    if (!body.ok) {
      return body.response;
    }
    const diets = await loadDeclaredDiet(athleteId);
    return NextResponse.json({ entry: await updateFoodLogEntry(athleteId, id, body.data, diets) });
  } catch (error) {
    return failure('update', error);
  }
}

/** `DELETE /api/v1/food-log/[id]`. */
export async function deleteEntry(id: string) {
  try {
    const athleteId = await getCurrentAthleteId();
    await deleteFoodLogEntry(athleteId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return failure('delete', error);
  }
}

async function limited(athleteId: string) {
  const rateLimit = await checkRateLimit(rateLimiters.foodSearch, athleteId);
  return rateLimit.ok
    ? null
    : NextResponse.json(rateLimitJsonResponse(rateLimit).body, { status: 429 });
}

/**
 * `GET /api/v1/food-log/foods?q=` — the foods the athlete already ate (ADR-069), own foods, generic
 * foods from Ciqual (ADR-065), then Open Food Facts. A food listed as eaten is not listed again
 * below. Generic foods come from the bundled table, so they answer even when OFF does not.
 */
export async function searchFoods(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ error: 'Recherche de 2 à 80 caractères' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    const blocked = await limited(athleteId);
    if (blocked) {
      return blocked;
    }
    const [eaten, own, generic, off, diets] = await Promise.all([
      searchEatenFoods(athleteId, query),
      searchOwnFoods(athleteId, query),
      cacheGenericFoods(searchCiqualFoods(query)),
      searchOffProducts(query)
        .then(cacheSearchResults)
        .catch((error) => {
          console.error('[api/v1/food-log] off search', error);
          return null;
        }),
      loadDeclaredDiet(athleteId),
    ]);
    const eatenIds = new Set(eaten.map((food) => food.product.id));
    const notEaten = (product: { id: string }) => !eatenIds.has(product.id);
    return NextResponse.json({
      eaten: eaten.map(({ product, timesEaten, lastGrams }) => ({
        product: servedProduct(product, diets),
        timesEaten,
        lastGrams,
      })),
      own: own.filter(notEaten).map((product) => servedProduct(product, diets)),
      generic: generic.filter(notEaten).map((product) => servedProduct(product, diets)),
      products: (off ?? []).filter(notEaten).map((product) => servedProduct(product, diets)),
      offUnavailable: off === null,
    });
  } catch (error) {
    return failure('search', error);
  }
}

/** `GET /api/v1/food-log/foods/barcode/[code]` — a scanned product, or 404. */
export async function foodByBarcode(code: string) {
  if (!isBarcode(code)) {
    return NextResponse.json({ error: 'Code-barres invalide' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    const blocked = await limited(athleteId);
    if (blocked) {
      return blocked;
    }
    const [product, diets] = await Promise.all([
      findProductByBarcode(code),
      loadDeclaredDiet(athleteId),
    ]);
    return product
      ? NextResponse.json({ product: servedProduct(product, diets) })
      : NextResponse.json({ error: 'Produit inconnu d’Open Food Facts' }, { status: 404 });
  } catch (error) {
    console.error('[api/v1/food-log] barcode', error);
    return NextResponse.json({ error: 'Open Food Facts ne répond pas' }, { status: 503 });
  }
}

/** `POST /api/v1/food-log/foods` — the athlete's own food. */
export async function addCustomFood(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, customFoodSchema);
    if (!body.ok) {
      return body.response;
    }
    const [product, diets] = await Promise.all([
      createCustomFood(athleteId, body.data),
      loadDeclaredDiet(athleteId),
    ]);
    return NextResponse.json({ product: servedProduct(product, diets) }, { status: 201 });
  } catch (error) {
    return failure('custom food', error);
  }
}

/** `GET /api/v1/food-log/foods/mine` — the athlete's own foods, to pick, edit or delete. */
export async function getOwnFoods() {
  try {
    const athleteId = await getCurrentAthleteId();
    const [foods, diets] = await Promise.all([
      listOwnFoods(athleteId),
      loadDeclaredDiet(athleteId),
    ]);
    return NextResponse.json({ foods: foods.map((product) => servedProduct(product, diets)) });
  } catch (error) {
    return failure('own foods', error);
  }
}

/** `PATCH /api/v1/food-log/foods/[id]` — an own food edited; logged entries keep their snapshot. */
export async function editCustomFood(request: NextRequest, id: string) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, customFoodUpdateSchema);
    if (!body.ok) {
      return body.response;
    }
    const [product, diets] = await Promise.all([
      updateCustomFood(athleteId, id, body.data),
      loadDeclaredDiet(athleteId),
    ]);
    return NextResponse.json({ product: servedProduct(product, diets) });
  } catch (error) {
    return failure('edit food', error);
  }
}

/** `DELETE /api/v1/food-log/foods/[id]`. */
export async function removeCustomFood(id: string) {
  try {
    await deleteCustomFood(await getCurrentAthleteId(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return failure('delete food', error);
  }
}

/** `PUT /api/v1/food-log/targets?trainingDayId=` — the daily targets; today's row follows. */
export async function putTargets(request: NextRequest) {
  const trainingDayId = request.nextUrl.searchParams.get('trainingDayId');
  if (!trainingDayId || !DAY_ID.test(trainingDayId)) {
    return NextResponse.json({ error: 'trainingDayId requis (YYYY-MM-DD)' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, nutritionTargetsSchema);
    if (!body.ok) {
      return body.response;
    }
    return NextResponse.json({
      targets: await setNutritionTargets(athleteId, body.data, trainingDayId),
    });
  } catch (error) {
    return failure('targets', error);
  }
}
