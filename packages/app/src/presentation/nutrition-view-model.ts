export type NutritionMacroProgressLine = {
  consumed: number;
  goal: number | null;
  remaining: number | null;
  pct: number | null;
  unit: 'kcal' | 'g';
};

export type NutritionGoalsProgress = {
  calories: NutritionMacroProgressLine;
  protein: NutritionMacroProgressLine;
  carbohydrates: NutritionMacroProgressLine;
  fat: NutritionMacroProgressLine;
  exerciseCalories: number;
  calorieBudget: number;
};

export type NutritionFoodEntry = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  fiber?: number;
};

export type NutritionMealSummary = {
  name: string;
  label: string;
  /**
   * Optional line under the meal title. Null when it would repeat `label`
   * (e.g. stored name already « Petit-déjeuner »).
   */
  subtitle: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: NutritionFoodEntry[];
};

export type NutritionFuelDensity = {
  proteinGPerKg: number;
  carbohydratesGPerKg: number;
  referenceWeightKg: number;
};

export type NutritionDaySummary = {
  date: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  complete: boolean;
  meals: NutritionMealSummary[];
  goalsProgress: NutritionGoalsProgress | null;
  /** Per-kilogram macro density when a recent body weight is available. */
  fuelDensity: NutritionFuelDensity | null;
};

/** Diet declared in the journal preferences (single source: AthleteProfile.journalPrefs). */
export type NutritionDietView = {
  ids: string[];
  labels: string[];
};

export type NutritionCoachReadingTone = 'on_track' | 'watch' | 'off_track';

export type NutritionCoachReadingJob = 'fuel' | 'quality' | 'diet' | 'weight';

/**
 * Coach reading of the selected day (docs/product/NUTRITION_DAY_ANALYSIS.md).
 * `null` when no reading applies: nothing logged, or coach AI unavailable.
 */
export type NutritionCoachReadingView =
  | { state: 'pending' }
  | { state: 'awaiting_day_end' }
  | { state: 'unavailable' }
  | {
      state: 'ready';
      status: 'FINAL' | 'PROVISIONAL';
      /** A newer reading is being generated; this one stays visible meanwhile. */
      refreshing: boolean;
      generatedAt: string;
      verdict: { headline: string; tone: NutritionCoachReadingTone };
      findings: { job: NutritionCoachReadingJob; text: string }[];
      action: { text: string };
      flaggedEntries: {
        meal: string;
        entry: string;
        reason: 'diet_conflict' | 'ultra_processed';
      }[];
    };

export type NutritionViewModel = {
  /** The athlete keeps a food log: always true since the log lives in SHARPIT (ADR-061). */
  connected: boolean;
  /** MyFitnessPal is linked, so it can be synced — a fallback source for unlogged days. */
  mfpConnected: boolean;
  diet: NutritionDietView;
  coachReading: NutritionCoachReadingView | null;
  selectedDay: NutritionDaySummary | null;
  /** Alias for Today card — always the live calendar day. */
  today: NutritionDaySummary | null;
  history: NutritionDaySummary[];
  emptyState?: {
    title: string;
    description: string;
  } | null;
};
