/**
 * Live eval of « Décrire un repas »: real model, golden descriptions. Checks what no mocked test
 * can — that dishes are told apart, a dish known as a whole stays one line, stated grams are
 * kept and the meal's energy lands in a range worked out from the Ciqual table.
 * Needs `AI_GATEWAY_API_KEY`; no database (usage recording fails soft). Run after any change to
 * the prompt or the model:
 *
 *   AI_GATEWAY_API_KEY=… yarn api eval:food-describe
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describeMealFromText } from '@sharpit/server/lib/nutrition/food-log/food-describe';

type Fixture = {
  description: string;
  /** Fewest and most dishes a careful reader would count. */
  dishes: [number, number];
  /** One pattern per expected dish name, in order; extra dishes are allowed within `dishes`. */
  names: string[];
  /** Dishes that must stay one line, never split into ingredients. */
  whole?: string[];
  /** Foods that must be counted, by their table name — the ones a dish's name only implies. */
  foods?: string[];
  /** Stated weights that must come back as they were said. */
  grams?: number[];
  kcal: [number, number];
};

const fixtures = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'eval-food-describe-fixtures.json'), 'utf8'),
) as Fixture[];

/** Reads every fixture; answers how many were not read as expected. */
async function run(): Promise<number> {
  let failed = 0;
  for (const fixture of fixtures) {
    const { dishes } = await describeMealFromText({
      athleteId: 'eval',
      description: fixture.description,
    });
    const items = dishes.flatMap((dish) => dish.items);
    const kcal = Math.round(
      items.reduce((sum, item) => sum + (item.kcalPer100g * item.grams) / 100, 0),
    );
    const named = (pattern: string) =>
      dishes.find((dish) => new RegExp(pattern, 'i').test(dish.name));
    const failures = [
      (dishes.length < fixture.dishes[0] || dishes.length > fixture.dishes[1]) &&
        `${dishes.length} dishes, expected ${fixture.dishes.join('–')}`,
      ...fixture.names.map((pattern) => !named(pattern) && `no dish named /${pattern}/`),
      ...(fixture.whole ?? []).map(
        (pattern) =>
          (named(pattern)?.items.length ?? 1) > 1 && `/${pattern}/ split into ingredients`,
      ),
      ...(fixture.foods ?? []).map(
        (pattern) =>
          !items.some((item) => new RegExp(pattern, 'i').test(item.searchName)) &&
          `no food /${pattern}/`,
      ),
      ...(fixture.grams ?? []).map(
        (grams) => !items.some((item) => item.grams === grams) && `no food at ${grams} g`,
      ),
      (kcal < fixture.kcal[0] || kcal > fixture.kcal[1]) &&
        `${kcal} kcal, expected ${fixture.kcal.join('–')}`,
    ].filter((failure): failure is string => Boolean(failure));

    failed += failures.length > 0 ? 1 : 0;
    console.log(`${failures.length > 0 ? 'FAIL' : 'ok  '} ${fixture.description}`);
    for (const dish of dishes) {
      const foods = dish.items.map((item) => `${item.searchName} ${item.grams} g`).join(', ');
      console.log(`       ${dish.name}: ${foods}`);
    }
    console.log(
      `       ${kcal} kcal${failures.map((failure) => `\n       ✗ ${failure}`).join('')}`,
    );
  }

  console.log(`\n${fixtures.length - failed}/${fixtures.length} descriptions read as expected`);
  return failed;
}

void run().then((failed) => process.exit(failed > 0 ? 1 : 0));
