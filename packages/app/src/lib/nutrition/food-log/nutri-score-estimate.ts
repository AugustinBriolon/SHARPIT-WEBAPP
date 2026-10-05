/**
 * Nutri-Score (2023 algorithm, general solid foods) estimated from a label's per-100 g values,
 * for foods Open Food Facts could not grade and for the athlete's own foods. An unknown fruit,
 * vegetable and legume share scores nothing: the estimate then errs on the strict side.
 */

export type NutriScoreLetter = 'a' | 'b' | 'c' | 'd' | 'e';

export type NutriScoreNutrients = {
  kcal: number;
  protein: number;
  sugars: number;
  saturatedFat: number;
  salt: number;
  fiber: number | null;
  /** Fruit, vegetable and legume share (%), when known. */
  fruitVegetableShare?: number | null;
};

const KJ_PER_KCAL = 4.184;

/** Lower bounds (exclusive) of each extra point. */
const ENERGY_KJ = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const SUGARS_G = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const SATURATED_FAT_G = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SALT_G = [
  0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4,
];
const PROTEIN_G = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
const FIBER_G = [3, 4.1, 5.2, 6.3, 7.4];

function fruitVegetablePoints(share: number | null | undefined): number {
  if (share === null || share === undefined) {
    return 0;
  }
  if (share > 80) {
    return 5;
  }
  if (share > 60) {
    return 2;
  }
  return share > 40 ? 1 : 0;
}

/** From this many unfavourable points on, protein no longer offsets them (2023 rule). */
const PROTEIN_CAP_FROM = 11;

function pointsFor(value: number, thresholds: readonly number[]): number {
  return thresholds.filter((threshold) => value > threshold).length;
}

type PointParts = {
  energy: number;
  sugars: number;
  saturatedFat: number;
  salt: number;
  protein: number;
  fiber: number | null;
  fruitVegetableShare?: number | null;
};

function totalPoints(parts: PointParts): number {
  const unfavourable = parts.energy + parts.sugars + parts.saturatedFat + parts.salt;
  const fiber = pointsFor(parts.fiber ?? 0, FIBER_G);
  const protein = unfavourable >= PROTEIN_CAP_FROM ? 0 : pointsFor(parts.protein, PROTEIN_G);
  return unfavourable - fiber - protein - fruitVegetablePoints(parts.fruitVegetableShare);
}

/** Nutri-Score points: lower is better (−17 … 55). */
export function estimateNutriScorePoints(nutrients: NutriScoreNutrients): number {
  return totalPoints({
    ...nutrients,
    energy: pointsFor(nutrients.kcal * KJ_PER_KCAL, ENERGY_KJ),
    sugars: pointsFor(nutrients.sugars, SUGARS_G),
    saturatedFat: pointsFor(nutrients.saturatedFat, SATURATED_FAT_G),
    salt: pointsFor(nutrients.salt, SALT_G),
  });
}

/** A label typed by the athlete: energy and the three macros always, the rest when known. */
export type LabelNutrients = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugars: number | null;
  saturatedFat: number | null;
  salt: number | null;
};

/**
 * Half the points of a label's own ceiling when the value is missing: sugars are at most the
 * carbohydrates, saturated fat at most the fat. Neither flatters nor condemns the food.
 */
function boundedPoints(value: number | null, ceiling: number, thresholds: readonly number[]) {
  return value === null
    ? Math.round(pointsFor(ceiling, thresholds) / 2)
    : pointsFor(value, thresholds);
}

/**
 * Nutri-Score points from an incomplete label (ADR-066): a missing sugar or saturated-fat value
 * reads half its ceiling's points; a missing salt, which nothing on the label bounds, reads none.
 */
export function estimateNutriScorePointsFromLabel(label: LabelNutrients): number {
  return totalPoints({
    energy: pointsFor(label.kcal * KJ_PER_KCAL, ENERGY_KJ),
    sugars: boundedPoints(label.sugars, label.carbs, SUGARS_G),
    saturatedFat: boundedPoints(label.saturatedFat, label.fat, SATURATED_FAT_G),
    salt: label.salt === null ? 0 : pointsFor(label.salt, SALT_G),
    protein: label.protein,
    fiber: label.fiber,
  });
}

/** Letter bands of the 2023 general-food scale. */
export function nutriScoreLetterOf(points: number): NutriScoreLetter {
  if (points <= 0) {
    return 'a';
  }
  if (points <= 2) {
    return 'b';
  }
  if (points <= 10) {
    return 'c';
  }
  if (points <= 18) {
    return 'd';
  }
  return 'e';
}
