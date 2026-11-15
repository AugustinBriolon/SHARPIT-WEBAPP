/**
 * Reference bands for the nutrition day analysis (docs/product/NUTRITION_DAY_ANALYSIS.md).
 *
 * One place for every threshold the facts compare against, so the science
 * review touches a single module. These restate consensus guidance; they are
 * not SHARPIT models and never feed Core.
 */

export type TrainingLoadBand = 'rest' | 'light' | 'moderate' | 'high' | 'very_high';

/**
 * Daily carbohydrate needs by training volume, g/kg body mass
 * (IOC 2011 consensus / ACSM 2016 position stand).
 */
export const CARBOHYDRATE_G_PER_KG: Record<TrainingLoadBand, { min: number; max: number }> = {
  rest: { min: 3, max: 5 },
  light: { min: 3, max: 5 },
  moderate: { min: 5, max: 7 },
  high: { min: 6, max: 10 },
  very_high: { min: 8, max: 12 },
};

/** Upper bound (minutes of training) of each band — the IOC bands are volume-based. */
export const LOAD_BAND_MAX_MINUTES: Record<Exclude<TrainingLoadBand, 'very_high'>, number> = {
  rest: 0,
  light: 45,
  moderate: 90,
  high: 240,
};

/** Daily protein for athletes, g/kg (ISSN 2017; upper end of the IOC range). */
export const PROTEIN_G_PER_KG = { min: 1.6, max: 2.2 } as const;

/** Protein per meal that maximises muscle protein synthesis, g/kg (ISSN 2017). */
export const PROTEIN_PER_MEAL_G_PER_KG = 0.3;

/** Adult fibre intake floor, g/day (EFSA). */
export const FIBRE_MIN_G = 25;

/**
 * Total sugar share of energy above which the reading flags it. MyFitnessPal
 * reports total, not free, sugar — the WHO 10 % free-sugar line would over-flag.
 */
export const SUGAR_ENERGY_SHARE_WATCH = 0.2;

/** Ketogenic ceiling and the common low-carb ceiling, g carbohydrate/day. */
export const KETO_MAX_CARBS_G = 50;
export const LOW_CARB_MAX_CARBS_G = 130;

/** A target within this many kg of the current weight reads as "maintain". */
export const WEIGHT_MAINTAIN_TOLERANCE_KG = 0.5;

export const KCAL_PER_G = { carbohydrates: 4, protein: 4, fat: 9 } as const;

/**
 * Training stress from which a day is at least this band whatever its minutes: an hour
 * of intervals empties more glycogen than an hour of easy riding, and the volume bands
 * alone read both as "moderate".
 */
export const LOAD_BAND_MIN_TSS: Record<'moderate' | 'high', number> = {
  moderate: 80,
  high: 150,
};
