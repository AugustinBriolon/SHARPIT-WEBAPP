import { CIQUAL_ATTRIBUTION } from './ciqual';
import type { DietFit, DietFitStatus } from './food-diet-fit';
import type { FoodHighlight, HighlightTone } from './food-health-highlights';
import type { HealthGrade, ServedFoodHealth } from './food-health-score';
import { OPEN_FOOD_FACTS_ATTRIBUTION } from './open-food-facts';

/**
 * How the Sharpit food score reads on the web (ADR-063): the words and tones around what the
 * server computed. The server words each reason; this only arranges them. The iOS app holds the
 * same reading (`FoodHealthPresentation`).
 */

/** A semantic tone, mapped to the design system's signal colours by the component. */
export type HealthTone = 'recovery' | 'neutral' | 'caution' | 'risk' | 'muted' | 'foreground';

export const HEALTH_GRADE_LABELS: Record<HealthGrade, string> = {
  excellent: 'Excellent',
  good: 'Correct',
  mediocre: 'Médiocre',
  poor: 'À éviter',
};

export function gradeTone(grade: HealthGrade | null | undefined): HealthTone {
  switch (grade) {
    case 'excellent':
      return 'recovery';
    case 'good':
      return 'foreground';
    case 'mediocre':
      return 'caution';
    case 'poor':
      return 'risk';
    default:
      return 'muted';
  }
}

export function highlightTone(tone: HighlightTone): HealthTone {
  if (tone === 'negative') {
    return 'risk';
  }
  return tone === 'positive' ? 'recovery' : 'neutral';
}

export function dietTone(status: DietFitStatus): HealthTone {
  if (status === 'compatible') {
    return 'recovery';
  }
  return status === 'incompatible' ? 'risk' : 'muted';
}

export type HealthReading = {
  watch: FoodHighlight[];
  strengths: FoodHighlight[];
  notes: FoodHighlight[];
};

export function splitHighlights(health: Pick<ServedFoodHealth, 'highlights'>): HealthReading {
  const highlights = health.highlights ?? [];
  return {
    watch: highlights.filter((item) => item.tone === 'negative'),
    strengths: highlights.filter((item) => item.tone === 'positive'),
    notes: highlights.filter((item) => item.tone === 'neutral'),
  };
}

export function incompatibleDiets(
  health: Pick<ServedFoodHealth, 'dietFit'> | null | undefined,
): DietFit[] {
  return (health?.dietFit ?? []).filter((fit) => fit.status === 'incompatible');
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** Under the grade: what to watch and the strengths, one line each. */
export function healthVerdict(health: Pick<ServedFoodHealth, 'highlights'>): string[] {
  const { watch, strengths } = splitHighlights(health);
  if (watch.length === 0 && strengths.length === 0) {
    return ['Rien de marquant dans sa composition'];
  }
  const lines: string[] = [];
  if (watch.length > 0) {
    lines.push(plural(watch.length, 'point à surveiller', 'points à surveiller'));
  }
  if (strengths.length > 0) {
    lines.push(plural(strengths.length, 'point fort', 'points forts'));
  }
  if (watch.length === 0) {
    lines.push('Rien à surveiller');
  }
  return lines;
}

/** Where the grade comes from: « Nutri-Score C (estimé) · NOVA 4 ». */
export function healthSources(
  health: Pick<ServedFoodHealth, 'nutriScore' | 'nutriScoreEstimated' | 'nova'>,
): string | null {
  const parts: string[] = [];
  if (health.nutriScore) {
    const letter = health.nutriScore.toUpperCase();
    parts.push(
      health.nutriScoreEstimated ? `Nutri-Score ${letter} (estimé)` : `Nutri-Score ${letter}`,
    );
  }
  if (health.nova) {
    parts.push(`NOVA ${health.nova}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** What the additive line says when the list itself is not there; null when it is. */
export function additiveStatus(
  health: Pick<ServedFoodHealth, 'additivesKnown' | 'additiveCount'>,
  completing: boolean,
): string | null {
  if (health.additivesKnown === 'count') {
    const counted = plural(health.additiveCount ?? 0, 'additif', 'additifs');
    return completing ? `${counted}, lecture du détail…` : `${counted}, détail indisponible`;
  }
  return health.additivesKnown === 'unknown'
    ? 'Ingrédients non renseignés : additifs inconnus'
    : null;
}

export const HEALTH_METHOD =
  'Nutrition 60 % (Nutri-Score), transformation 20 % (NOVA), additifs 20 %. Un additif à risque plafonne la note à 49. Une information manquante compte pour moitié.';
export const HEALTH_PARTIAL_METHOD =
  'Aliment saisi à la main : seule l’étiquette nutritionnelle est notée.';
export const HEALTH_DISCLAIMER = 'Indicateur Sharpit, pas un avis médical.';

/** The attribution line the listed foods' sources ask for; null for own foods only. */
export function foodSourcesAttribution(products: { source: string }[]): string | null {
  const parts: string[] = [];
  if (products.some((product) => product.source === 'CIQUAL')) {
    parts.push(CIQUAL_ATTRIBUTION);
  }
  if (products.some((product) => product.source === 'OFF')) {
    parts.push(OPEN_FOOD_FACTS_ATTRIBUTION);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A health object worth showing: scored, or at least explained. */
export function shownHealth<T extends { coverage?: string }>(
  health: T | null | undefined,
): T | null {
  return health && health.coverage !== 'none' ? health : null;
}
