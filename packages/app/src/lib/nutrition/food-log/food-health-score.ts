import { additiveRisk, type AdditiveInfo, type AdditiveRisk } from './additives-risk';
import { UNKNOWN_DIET_FACTS, type DietFacts, type DietFit } from './food-diet-fit';
import {
  foodHighlights,
  missingNutrientsPhrase,
  type FoodHighlight,
  type NutrientLevel,
} from './food-health-highlights';
import {
  estimateNutriScorePoints,
  estimateNutriScorePointsFromLabel,
  nutriScoreLetterOf,
  type NutriScoreLetter,
} from './nutri-score-estimate';

/**
 * Sharpit food health score (v2): nutrition 60 · NOVA 20 · additives 20 → 0–100, with the
 * highlights that explain it and the diet facts read from the label. Indicator only — not a
 * medical assessment. Decision record: ADR-063.
 */

export const FOOD_HEALTH_SCORE_VERSION = 2;

export type { NutrientLevel, NutriScoreLetter };
export type HealthCoverage = 'full' | 'partial' | 'none';
export type HealthGrade = 'excellent' | 'good' | 'mediocre' | 'poor';
/** `list`: each additive known · `count`: only how many (OFF search) · `unknown`: no ingredients. */
export type AdditivesKnown = 'list' | 'count' | 'unknown';
/** `summary`: built from an OFF search hit, worth a full product read when opened. */
export type HealthDetail = 'summary' | 'full';

export type NutrientFlags = {
  sugars: NutrientLevel;
  salt: NutrientLevel;
  saturatedFat: NutrientLevel;
};

export type FoodHealthAssessment = {
  score: number | null;
  scoreVersion: number;
  grade: HealthGrade | null;
  coverage: HealthCoverage;
  nutriScore: NutriScoreLetter | null;
  /** True when Sharpit computed the letter from the label rather than reading OFF's. */
  nutriScoreEstimated: boolean;
  nova: 1 | 2 | 3 | 4 | null;
  nutrientFlags: NutrientFlags;
  additives: AdditiveInfo[];
  additivesKnown: AdditivesKnown;
  additiveCount: number | null;
  highlights: FoodHighlight[];
  dietFacts: DietFacts;
  detail: HealthDetail;
};

/** The stored assessment with the athlete's declared diets read against it, as the API serves it. */
export type ServedFoodHealth = FoodHealthAssessment & { dietFit: DietFit[] };

/** Per-100 g values from the label; null when not given. */
export type HealthNutrients = {
  kcal: number | null;
  protein: number | null;
  fiber: number | null;
  sugars: number | null;
  salt: number | null;
  saturatedFat: number | null;
  /** Bound a missing sugar or saturated-fat value (ADR-066): sugars ≤ carbs, saturated ≤ fat. */
  carbs?: number | null;
  fat?: number | null;
  fruitVegetableShare?: number | null;
};

export type OffHealthInput = {
  kind?: 'off';
  nutriScore: NutriScoreLetter | null;
  /** OFF's raw Nutri-Score points, finer than the letter. */
  nutriScorePoints: number | null;
  /** Beverages have their own Nutri-Score scale: the points do not refine the letter there. */
  isBeverage: boolean;
  isSportsNutrition: boolean;
  nova: 1 | 2 | 3 | 4 | null;
  nutrientLevels: NutrientFlags;
  nutrients: HealthNutrients;
  additiveTags: string[] | null;
  additiveCount: number | null;
  dietFacts: DietFacts;
  detail: HealthDetail;
  /** Context the source adds ahead of the computed highlights (e.g. Ciqual's typical values). */
  notes?: FoodHighlight[];
};

export type CustomHealthInput = {
  kind: 'custom';
  kcalPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  fiberPer100g?: number | null;
  sugarPer100g?: number | null;
  saltPer100g?: number | null;
  saturatedFatPer100g?: number | null;
};

export type FoodHealthInput = OffHealthInput | CustomHealthInput;

/** EU reference amounts for solids (g / 100 g) used by OFF nutrient_levels. */
const THRESHOLDS = {
  sugars: { low: 5, high: 12.5 },
  salt: { low: 0.3, high: 1.5 },
  saturatedFat: { low: 1.5, high: 5 },
} as const;

/** Nutrition points (0–100) each letter spans, and the Nutri-Score points behind it. */
const LETTER_BANDS: Record<
  NutriScoreLetter,
  { points: [number, number]; nutri: [number, number] }
> = {
  a: { points: [85, 100], nutri: [-10, 0] },
  b: { points: [70, 84], nutri: [1, 2] },
  c: { points: [50, 69], nutri: [3, 10] },
  d: { points: [25, 49], nutri: [11, 18] },
  e: { points: [0, 24], nutri: [19, 35] },
};

const LEVEL_POINTS: Record<Exclude<NutrientLevel, 'unknown'>, number> = {
  low: 100,
  moderate: 55,
  high: 10,
};

const NOVA_POINTS: Record<1 | 2 | 3 | 4, number> = { 1: 20, 2: 15, 3: 8, 4: 0 };

const ADDITIVE_PENALTY: Record<AdditiveRisk, number> = { none: 1, limited: 3, high: 8 };

const WEIGHT = { nutrition: 0.6, nova: 20, additives: 20 } as const;
const UNKNOWN_SHARE = 0.5;
/** Penalty per additive when only their number is known: a limited one, the common case. */
const COUNTED_ADDITIVE_PENALTY = ADDITIVE_PENALTY.limited;
/** A high-risk additive keeps a food out of the top two grades, whatever its nutrition. */
const HIGH_RISK_CEILING = 49;

export function levelFromAmount(
  nutrient: keyof typeof THRESHOLDS,
  amount: number | null | undefined,
): NutrientLevel {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) {
    return 'unknown';
  }
  const { low, high } = THRESHOLDS[nutrient];
  if (amount <= low) {
    return 'low';
  }
  return amount > high ? 'high' : 'moderate';
}

/** The grade a 0–100 score reads as; shared by foods, meals and days. */
export function gradeOf(score: number): HealthGrade {
  if (score >= 75) {
    return 'excellent';
  }
  if (score >= 50) {
    return 'good';
  }
  return score >= 25 ? 'mediocre' : 'poor';
}

/** Places Nutri-Score points inside their letter's band; a letter alone sits mid-band. */
function letterPoints(letter: NutriScoreLetter, nutriPoints: number | null): number {
  const { points, nutri } = LETTER_BANDS[letter];
  if (nutriPoints === null) {
    return Math.round((points[0] + points[1]) / 2);
  }
  const position = (nutri[1] - nutriPoints) / (nutri[1] - nutri[0]);
  const clamped = Math.min(1, Math.max(0, position));
  return points[0] + clamped * (points[1] - points[0]);
}

function averageLevelPoints(flags: NutrientFlags): number | null {
  const known = [flags.sugars, flags.salt, flags.saturatedFat].filter(
    (level): level is Exclude<NutrientLevel, 'unknown'> => level !== 'unknown',
  );
  if (known.length === 0) {
    return null;
  }
  return known.reduce((sum, level) => sum + LEVEL_POINTS[level], 0) / known.length;
}

type Nutrition = { points: number; letter: NutriScoreLetter | null; estimated: boolean };

/** Nutri-Score points from the label: complete, or with missing lines bounded (ADR-066). */
function labelPoints(nutrients: HealthNutrients): number | null {
  const { kcal, protein, sugars, saturatedFat, salt, fiber, fruitVegetableShare } = nutrients;
  if (kcal === null || protein === null) {
    return null;
  }
  if (sugars !== null && saturatedFat !== null && salt !== null) {
    return estimateNutriScorePoints({
      kcal,
      protein,
      sugars,
      saturatedFat,
      salt,
      fiber,
      fruitVegetableShare,
    });
  }
  const carbs = nutrients.carbs ?? null;
  const fat = nutrients.fat ?? null;
  if (carbs === null || fat === null) {
    return null;
  }
  return estimateNutriScorePointsFromLabel({
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    sugars,
    saturatedFat,
    salt,
    fruitVegetableShare,
  });
}

function estimatedNutrition(nutrients: HealthNutrients): Nutrition | null {
  const nutriPoints = labelPoints(nutrients);
  if (nutriPoints === null) {
    return null;
  }
  const letter = nutriScoreLetterOf(nutriPoints);
  return { points: letterPoints(letter, nutriPoints), letter, estimated: true };
}

/** OFF's grade first, then an estimate from the label, then the three nutrient levels. */
function nutritionOf(
  nutrients: HealthNutrients,
  flags: NutrientFlags,
  off?: { letter: NutriScoreLetter | null; points: number | null; isBeverage: boolean },
): Nutrition | null {
  if (off?.letter) {
    const refined = off.isBeverage ? null : off.points;
    return { points: letterPoints(off.letter, refined), letter: off.letter, estimated: false };
  }
  const estimate = estimatedNutrition(nutrients);
  if (estimate) {
    return estimate;
  }
  const levels = averageLevelPoints(flags);
  return levels === null ? null : { points: levels, letter: null, estimated: false };
}

/** `e322` and `e322i` are one lecithin on the label: count it once. */
export function dedupeAdditives(tags: string[]): AdditiveInfo[] {
  const byCode = new Map<string, AdditiveInfo>();
  for (const tag of tags) {
    const info = additiveRisk(tag);
    const base = info.code.replace(/^(E\d{3,4}[A-F]?)(?:IV|V?I{1,3}|V)$/, '$1');
    const known = byCode.get(base);
    if (!known || ADDITIVE_PENALTY[info.risk] > ADDITIVE_PENALTY[known.risk]) {
      byCode.set(base, base === info.code ? info : additiveRisk(base));
    }
  }
  return [...byCode.values()];
}

type Additives = { points: number; list: AdditiveInfo[]; known: AdditivesKnown };

function additivesOf(tags: string[] | null, count: number | null): Additives {
  if (tags !== null) {
    const list = dedupeAdditives(tags);
    const penalty = list.reduce((sum, item) => sum + ADDITIVE_PENALTY[item.risk], 0);
    return { points: Math.max(0, WEIGHT.additives - penalty), list, known: 'list' };
  }
  if (count !== null) {
    const points = Math.max(0, WEIGHT.additives - count * COUNTED_ADDITIVE_PENALTY);
    return { points, list: [], known: 'count' };
  }
  return { points: WEIGHT.additives * UNKNOWN_SHARE, list: [], known: 'unknown' };
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}

const LABEL_LINES = [
  ['sugars', 'sucres'],
  ['saturatedFat', 'graisses saturées'],
  ['salt', 'sel'],
] as const;

/** Says which label lines the estimate went without, so the athlete knows what to fill in. */
function incompleteLabelNote(nutrients: HealthNutrients): FoodHighlight | null {
  const missing = LABEL_LINES.filter(([key]) => nutrients[key] === null).map(([, word]) => word);
  if (missing.length === 0) {
    return null;
  }
  return {
    key: 'label_incomplete',
    tone: 'neutral',
    label: 'Étiquette incomplète',
    detail: `${missingNutrientsPhrase(missing, 'non renseigné')} : score estimé`,
  };
}

function customNutrients(input: CustomHealthInput): HealthNutrients {
  return {
    kcal: input.kcalPer100g ?? null,
    protein: input.proteinPer100g ?? null,
    carbs: input.carbsPer100g ?? null,
    fat: input.fatPer100g ?? null,
    fiber: input.fiberPer100g ?? null,
    sugars: input.sugarPer100g ?? null,
    salt: input.saltPer100g ?? null,
    saturatedFat: input.saturatedFatPer100g ?? null,
  };
}

function flagsOf(nutrients: HealthNutrients): NutrientFlags {
  return {
    sugars: levelFromAmount('sugars', nutrients.sugars),
    salt: levelFromAmount('salt', nutrients.salt),
    saturatedFat: levelFromAmount('saturatedFat', nutrients.saturatedFat),
  };
}

function customAssessment(input: CustomHealthInput): FoodHealthAssessment {
  const nutrients = customNutrients(input);
  const nutrientFlags = flagsOf(nutrients);
  const nutrition = nutritionOf(nutrients, nutrientFlags);
  const score = nutrition === null ? null : clampScore(nutrition.points);
  const note = score === null ? null : incompleteLabelNote(nutrients);
  return {
    score,
    scoreVersion: FOOD_HEALTH_SCORE_VERSION,
    grade: score === null ? null : gradeOf(score),
    coverage: score === null ? 'none' : 'partial',
    nutriScore: nutrition?.letter ?? null,
    nutriScoreEstimated: nutrition?.estimated ?? false,
    nova: null,
    nutrientFlags,
    additives: [],
    additivesKnown: 'unknown',
    additiveCount: null,
    highlights: [
      ...(note ? [note] : []),
      ...foodHighlights({
        ...nutrients,
        levels: nutrientFlags,
        nova: null,
        additives: null,
        isSportsNutrition: false,
      }),
    ],
    dietFacts: UNKNOWN_DIET_FACTS,
    detail: 'full',
  };
}

function offAssessment(input: OffHealthInput): FoodHealthAssessment {
  const nutrition = nutritionOf(input.nutrients, input.nutrientLevels, {
    letter: input.nutriScore,
    points: input.nutriScorePoints,
    isBeverage: input.isBeverage,
  });
  const additives = additivesOf(input.additiveTags, input.additiveCount);
  const novaPoints = input.nova ? NOVA_POINTS[input.nova] : WEIGHT.nova * UNKNOWN_SHARE;
  const ceiling = additives.list.some((item) => item.risk === 'high') ? HIGH_RISK_CEILING : 100;
  const score =
    nutrition === null
      ? null
      : Math.min(
          ceiling,
          clampScore(nutrition.points * WEIGHT.nutrition + novaPoints + additives.points),
        );
  return {
    score,
    scoreVersion: FOOD_HEALTH_SCORE_VERSION,
    grade: score === null ? null : gradeOf(score),
    coverage: score === null ? 'none' : 'full',
    nutriScore: nutrition?.letter ?? null,
    nutriScoreEstimated: nutrition?.estimated ?? false,
    nova: input.nova,
    nutrientFlags: input.nutrientLevels,
    additives: additives.list,
    additivesKnown: additives.known,
    additiveCount: additives.known === 'list' ? additives.list.length : input.additiveCount,
    highlights: [
      ...(input.notes ?? []),
      ...foodHighlights({
        ...input.nutrients,
        levels: input.nutrientLevels,
        nova: input.nova,
        additives: additives.known === 'list' ? additives.list : null,
        isSportsNutrition: input.isSportsNutrition,
      }),
    ],
    dietFacts: input.dietFacts,
    detail: input.detail,
  };
}

/** Full OFF product, or a custom food scored from its label alone. */
export function computeFoodHealth(input: FoodHealthInput): FoodHealthAssessment {
  return input.kind === 'custom' ? customAssessment(input) : offAssessment(input);
}
