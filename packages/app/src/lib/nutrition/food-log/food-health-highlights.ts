import type { AdditiveInfo } from './additives-risk';

/**
 * Why a food scores what it scores, in the athlete's words: what to watch, what is good, and the
 * context that changes the reading (a gel is sugar on purpose). Thresholds follow the EU nutrition
 * claims (Regulation 1924/2006) so « riche en protéines » means what a label would mean by it.
 */

export type HighlightTone = 'negative' | 'positive' | 'neutral';

export type FoodHighlight = {
  key: string;
  tone: HighlightTone;
  label: string;
  detail: string | null;
};

export type NutrientLevel = 'low' | 'moderate' | 'high' | 'unknown';

export type HighlightInput = {
  kcal: number | null;
  protein: number | null;
  fiber: number | null;
  sugars: number | null;
  salt: number | null;
  saturatedFat: number | null;
  levels: { sugars: NutrientLevel; salt: NutrientLevel; saturatedFat: NutrientLevel };
  nova: 1 | 2 | 3 | 4 | null;
  /** Null when the additive list is not known. */
  additives: AdditiveInfo[] | null;
  isSportsNutrition: boolean;
};

/**
 * « Sucres, sel non renseignés », « Sel non renseigné »: the nutrients named, capitalised, with
 * the participle agreeing (plural for several, or for one plural noun such as « sucres »).
 */
export function missingNutrientsPhrase(words: string[], participle: string): string {
  const list = words.join(', ');
  const plural = words.length > 1 || /s$/.test(words[0] ?? '');
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${participle}${plural ? 's' : ''}`;
}

/** EU claims: protein share of energy, fibre per 100 g. */
const PROTEIN_ENERGY_SHARE = { source: 0.12, rich: 0.2 } as const;
const FIBER_G = { source: 3, rich: 6 } as const;
/** Energy-dense enough to name it: nuts, chocolate, crisps. */
const DENSE_KCAL = 450;

function grams(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  const rounded = value < 1 ? Math.round(value * 100) / 100 : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} g/100 g`;
}

function proteinHighlight(input: HighlightInput): FoodHighlight | null {
  const { protein, kcal } = input;
  if (protein === null || kcal === null || kcal <= 0) {
    return null;
  }
  const share = (protein * 4) / kcal;
  if (share >= PROTEIN_ENERGY_SHARE.rich) {
    return {
      key: 'protein_rich',
      tone: 'positive',
      label: 'Riche en protéines',
      detail: grams(protein),
    };
  }
  if (share >= PROTEIN_ENERGY_SHARE.source) {
    return {
      key: 'protein_source',
      tone: 'positive',
      label: 'Source de protéines',
      detail: grams(protein),
    };
  }
  return null;
}

function fiberHighlight(fiber: number | null): FoodHighlight | null {
  if (fiber === null) {
    return null;
  }
  if (fiber >= FIBER_G.rich) {
    return { key: 'fiber_rich', tone: 'positive', label: 'Riche en fibres', detail: grams(fiber) };
  }
  if (fiber >= FIBER_G.source) {
    return {
      key: 'fiber_source',
      tone: 'positive',
      label: 'Source de fibres',
      detail: grams(fiber),
    };
  }
  return null;
}

const LEVEL_WORDS = {
  sugars: { high: 'Trop sucré', low: 'Peu sucré' },
  salt: { high: 'Trop salé', low: 'Peu salé' },
  saturatedFat: { high: 'Trop de graisses saturées', low: 'Peu de graisses saturées' },
} as const;

function levelHighlights(input: HighlightInput): FoodHighlight[] {
  return (['sugars', 'salt', 'saturatedFat'] as const).flatMap((nutrient) => {
    const level = input.levels[nutrient];
    if (level !== 'high' && level !== 'low') {
      return [];
    }
    return [
      {
        key: `${nutrient}_${level}`,
        tone: level === 'high' ? ('negative' as const) : ('positive' as const),
        label: LEVEL_WORDS[nutrient][level],
        detail: grams(input[nutrient]),
      },
    ];
  });
}

function processingHighlight(nova: HighlightInput['nova']): FoodHighlight | null {
  if (nova === 4) {
    return {
      key: 'ultra_processed',
      tone: 'negative',
      label: 'Ultra-transformé',
      detail: 'NOVA 4 : recette industrielle',
    };
  }
  if (nova === 1) {
    return {
      key: 'unprocessed',
      tone: 'positive',
      label: 'Brut',
      detail: 'NOVA 1 : non transformé',
    };
  }
  return null;
}

function additiveHighlight(additives: AdditiveInfo[] | null): FoodHighlight | null {
  if (additives === null) {
    return null;
  }
  const risky = additives.filter((additive) => additive.risk === 'high');
  if (risky.length > 0) {
    return {
      key: 'additives_high',
      tone: 'negative',
      label: risky.length > 1 ? `${risky.length} additifs à éviter` : 'Additif à éviter',
      detail: risky.map((additive) => additive.name).join(', '),
    };
  }
  return additives.length === 0
    ? { key: 'additive_free', tone: 'positive', label: 'Sans additif', detail: null }
    : null;
}

function energyHighlight(kcal: number | null): FoodHighlight | null {
  return kcal !== null && kcal >= DENSE_KCAL
    ? {
        key: 'energy_dense',
        tone: 'negative',
        label: 'Très calorique',
        detail: `${Math.round(kcal)} kcal/100 g`,
      }
    : null;
}

const SPORTS_NOTE: FoodHighlight = {
  key: 'sports_nutrition',
  tone: 'neutral',
  label: 'Produit d’effort',
  detail: 'Sucres rapides voulus : à garder pour l’entraînement',
};

/** Negatives first, the worst on top, then positives; the effort note leads when it applies. */
export function foodHighlights(input: HighlightInput): FoodHighlight[] {
  const levels = levelHighlights(input);
  const negatives = [
    additiveHighlight(input.additives),
    ...levels.filter((item) => item.tone === 'negative'),
    processingHighlight(input.nova),
    energyHighlight(input.kcal),
  ].filter((item): item is FoodHighlight => item?.tone === 'negative');
  const positives = [
    proteinHighlight(input),
    fiberHighlight(input.fiber),
    ...levels.filter((item) => item.tone === 'positive'),
    processingHighlight(input.nova),
    additiveHighlight(input.additives),
  ].filter((item): item is FoodHighlight => item?.tone === 'positive');
  return [...(input.isSportsNutrition ? [SPORTS_NOTE] : []), ...negatives, ...positives];
}
