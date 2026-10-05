/**
 * What a food says about the diets an athlete can declare in the journal (`journalPrefs`):
 * the facts are read once from Open Food Facts and stored with the product, the fit is worked out
 * per athlete when the food is served. Indicator only — an allergy needs the label itself.
 */

export type PlantStatus = 'yes' | 'maybe' | 'no' | 'unknown';
export type AllergenStatus = 'certified' | 'absent' | 'traces' | 'contains' | 'unknown';

export type DietFacts = {
  vegan: PlantStatus;
  vegetarian: PlantStatus;
  gluten: AllergenStatus;
  milk: AllergenStatus;
};

export type DietFitStatus = 'compatible' | 'uncertain' | 'incompatible';

export type DietFit = {
  diet: string;
  label: string;
  status: DietFitStatus;
  reason: string;
};

export type OffDietTags = {
  ingredientsAnalysis: string[] | null;
  allergens: string[] | null;
  traces: string[] | null;
  labels: string[] | null;
  categories: string[] | null;
  /** Ingredients OFF could read; zero or null means the allergen list says nothing. */
  ingredientCount: number | null;
};

export const UNKNOWN_DIET_FACTS: DietFacts = {
  vegan: 'unknown',
  vegetarian: 'unknown',
  gluten: 'unknown',
  milk: 'unknown',
};

/** Single-ingredient plant foods OFF often lists without ingredients (a bunch of bananas). */
const PLANT_CATEGORIES = [
  'en:fresh-fruits',
  'en:fruits',
  'en:fresh-vegetables',
  'en:vegetables',
  'en:legumes',
];

const GLUTEN_FREE_LABELS = ['en:no-gluten', 'en:gluten-free'];
const MILK_FREE_LABELS = ['en:no-milk', 'en:dairy-free', 'en:no-lactose-and-dairy'];

function plantStatus(tags: string[], kind: 'vegan' | 'vegetarian'): PlantStatus {
  if (tags.includes(`en:${kind}`)) {
    return 'yes';
  }
  if (tags.includes(`en:non-${kind}`)) {
    return 'no';
  }
  return tags.includes(`en:maybe-${kind}`) ? 'maybe' : 'unknown';
}

function allergenStatus(
  allergen: string,
  freeLabels: string[],
  tags: OffDietTags,
  plantOnly: boolean,
): AllergenStatus {
  if (tags.allergens?.includes(allergen)) {
    return 'contains';
  }
  if (tags.traces?.includes(allergen)) {
    return 'traces';
  }
  if (tags.labels?.some((label) => freeLabels.includes(label))) {
    return 'certified';
  }
  const ingredientsRead = (tags.ingredientCount ?? 0) > 0 && tags.allergens !== null;
  return ingredientsRead || plantOnly ? 'absent' : 'unknown';
}

function isPlainPlant(tags: OffDietTags): boolean {
  return (
    (tags.ingredientCount ?? 0) <= 1 &&
    (tags.categories ?? []).some((category) => PLANT_CATEGORIES.includes(category))
  );
}

export function dietFactsFromOff(tags: OffDietTags): DietFacts {
  const analysis = tags.ingredientsAnalysis ?? [];
  const plainPlant = isPlainPlant(tags);
  const vegan = plantStatus(analysis, 'vegan');
  const vegetarian = plantStatus(analysis, 'vegetarian');
  return {
    vegan: vegan === 'unknown' && plainPlant ? 'yes' : vegan,
    vegetarian: vegetarian === 'unknown' && plainPlant ? 'yes' : vegetarian,
    gluten: allergenStatus('en:gluten', GLUTEN_FREE_LABELS, tags, plainPlant),
    milk: allergenStatus('en:milk', MILK_FREE_LABELS, tags, plainPlant || vegan === 'yes'),
  };
}

type Verdict = { status: DietFitStatus; reason: string };

function plantVerdict(status: PlantStatus, word: string): Verdict {
  switch (status) {
    case 'yes':
      return { status: 'compatible', reason: `Ingrédients ${word}` };
    case 'no':
      return { status: 'incompatible', reason: `Contient des ingrédients non ${word}` };
    case 'maybe':
      return { status: 'uncertain', reason: 'Un ingrédient peut être d’origine animale' };
    default:
      return { status: 'uncertain', reason: 'Ingrédients inconnus' };
  }
}

function allergenVerdict(status: AllergenStatus, noun: string): Verdict {
  switch (status) {
    case 'certified':
      return { status: 'compatible', reason: `Étiqueté sans ${noun}` };
    case 'absent':
      return { status: 'compatible', reason: `Aucun ${noun} déclaré` };
    case 'traces':
      return { status: 'uncertain', reason: `Traces possibles de ${noun}` };
    case 'contains':
      return { status: 'incompatible', reason: `Contient du ${noun}` };
    default:
      return { status: 'uncertain', reason: 'Allergènes non renseignés' };
  }
}

/** Carbohydrate ceilings per 100 g: compatible up to the first, uncertain up to the second. */
const CARB_LIMITS = {
  keto: [5, 10],
  low_carb: [10, 20],
} as const;

function carbVerdict(
  carbsPer100g: number,
  [compatible, uncertain]: readonly [number, number],
): Verdict {
  const grams = String(Math.round(carbsPer100g * 10) / 10).replace('.', ',');
  const amount = `${grams} g de glucides/100 g`;
  if (carbsPer100g <= compatible) {
    return { status: 'compatible', reason: amount };
  }
  if (carbsPer100g <= uncertain) {
    return { status: 'uncertain', reason: `${amount} — à doser` };
  }
  return { status: 'incompatible', reason: amount };
}

function verdictFor(diet: string, facts: DietFacts, carbsPer100g: number): Verdict | null {
  switch (diet) {
    case 'vegan':
      return plantVerdict(facts.vegan, 'végétaliens');
    case 'vegetarian':
      return plantVerdict(facts.vegetarian, 'végétariens');
    case 'gluten_free':
      return allergenVerdict(facts.gluten, 'gluten');
    case 'dairy_free':
      return allergenVerdict(facts.milk, 'lait');
    case 'keto':
    case 'low_carb':
      return carbVerdict(carbsPer100g, CARB_LIMITS[diet]);
    default:
      return null;
  }
}

/** One verdict per declared diet this module knows, in the order the athlete declared them. */
export function assessDietFit(
  facts: DietFacts,
  carbsPer100g: number,
  diets: { ids: string[]; labels: string[] },
): DietFit[] {
  return diets.ids.flatMap((diet, index) => {
    const verdict = verdictFor(diet, facts, carbsPer100g);
    return verdict ? [{ diet, label: diets.labels[index] ?? diet, ...verdict }] : [];
  });
}
