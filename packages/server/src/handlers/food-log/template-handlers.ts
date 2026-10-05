import { NextRequest, NextResponse } from 'next/server';
import {
  foodLogCopySchema,
  recipeSchema,
  savedMealCreateSchema,
  savedMealLogSchema,
} from '@sharpit/app/lib/validators/food-log';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { servedProduct } from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import {
  copyFoodLog,
  createRecipe,
  createSavedMeal,
  deleteSavedMeal,
  listSavedMeals,
  logSavedMeal,
  updateRecipe,
} from '@sharpit/server/lib/nutrition/food-log/food-log-templates';
import { loadDeclaredDiet } from '@sharpit/server/lib/nutrition/analysis/nutrition-analysis-inputs';
import { failure, parseBody } from './service-handlers';

/**
 * Copy a meal, saved meals and recipes (ADR-071): what a MyFitnessPal athlete logs with in one
 * tap. Writes answer the entries as the day lists them, so a client adds them to its day at once.
 */

/** `POST /api/v1/food-log/copy` — a meal or a day eaten again. */
export async function copyEntries(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, foodLogCopySchema);
    if (!body.ok) {
      return body.response;
    }
    const diets = await loadDeclaredDiet(athleteId);
    return NextResponse.json(
      { entries: await copyFoodLog(athleteId, body.data, diets) },
      { status: 201 },
    );
  } catch (error) {
    return failure('copy', error);
  }
}

/** `GET /api/v1/food-log/meals` — the athlete's saved meals, last used first. */
export async function getSavedMeals() {
  try {
    const athleteId = await getCurrentAthleteId();
    const diets = await loadDeclaredDiet(athleteId);
    return NextResponse.json({ meals: await listSavedMeals(athleteId, diets) });
  } catch (error) {
    return failure('saved meals', error);
  }
}

/** `POST /api/v1/food-log/meals` — keeps a logged meal under a name. */
export async function addSavedMeal(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, savedMealCreateSchema);
    if (!body.ok) {
      return body.response;
    }
    const diets = await loadDeclaredDiet(athleteId);
    return NextResponse.json(
      { meal: await createSavedMeal(athleteId, body.data, diets) },
      { status: 201 },
    );
  } catch (error) {
    return failure('save meal', error);
  }
}

/** `DELETE /api/v1/food-log/meals/[id]` — the entries it logged stay. */
export async function removeSavedMeal(id: string) {
  try {
    await deleteSavedMeal(await getCurrentAthleteId(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return failure('delete saved meal', error);
  }
}

/** `POST /api/v1/food-log/meals/[id]/log` — a saved meal logged into a meal of a day. */
export async function logSaved(request: NextRequest, id: string) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, savedMealLogSchema);
    if (!body.ok) {
      return body.response;
    }
    const diets = await loadDeclaredDiet(athleteId);
    return NextResponse.json(
      { entries: await logSavedMeal(athleteId, id, body.data, diets) },
      { status: 201 },
    );
  } catch (error) {
    return failure('log saved meal', error);
  }
}

/** `POST /api/v1/food-log/recipes` — an own food made of other foods. */
export async function addRecipe(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, recipeSchema);
    if (!body.ok) {
      return body.response;
    }
    const [product, diets] = await Promise.all([
      createRecipe(athleteId, body.data),
      loadDeclaredDiet(athleteId),
    ]);
    return NextResponse.json({ product: servedProduct(product, diets) }, { status: 201 });
  } catch (error) {
    return failure('recipe', error);
  }
}

/** `PUT /api/v1/food-log/recipes/[id]` — new ingredients; logged entries keep their snapshot. */
export async function replaceRecipe(request: NextRequest, id: string) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await parseBody(request, recipeSchema);
    if (!body.ok) {
      return body.response;
    }
    const [product, diets] = await Promise.all([
      updateRecipe(athleteId, id, body.data),
      loadDeclaredDiet(athleteId),
    ]);
    return NextResponse.json({ product: servedProduct(product, diets) });
  } catch (error) {
    return failure('edit recipe', error);
  }
}
