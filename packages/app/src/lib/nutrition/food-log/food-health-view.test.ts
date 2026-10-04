import { describe, expect, it } from 'vitest';
import {
  additiveStatus,
  dietTone,
  foodSourcesAttribution,
  gradeTone,
  healthSources,
  healthVerdict,
  incompatibleDiets,
  shownHealth,
  splitHighlights,
} from './food-health-view';
import type { FoodHighlight } from './food-health-highlights';

const SUGAR: FoodHighlight = {
  key: 'sugars_high',
  tone: 'negative',
  label: 'Trop sucré',
  detail: null,
};
const PROTEIN: FoodHighlight = {
  key: 'protein_rich',
  tone: 'positive',
  label: 'Riche en protéines',
  detail: null,
};
const EFFORT: FoodHighlight = {
  key: 'sports_nutrition',
  tone: 'neutral',
  label: 'Effort',
  detail: null,
};

describe('food health view', () => {
  it('splits the reasons and words the verdict, one line each', () => {
    const health = { highlights: [EFFORT, SUGAR, PROTEIN] };
    expect(splitHighlights(health)).toEqual({
      watch: [SUGAR],
      strengths: [PROTEIN],
      notes: [EFFORT],
    });
    expect(healthVerdict(health)).toEqual(['1 point à surveiller', '1 point fort']);
    expect(healthVerdict({ highlights: [PROTEIN, PROTEIN] })).toEqual([
      '2 points forts',
      'Rien à surveiller',
    ]);
    expect(healthVerdict({ highlights: [] })).toEqual(['Rien de marquant dans sa composition']);
  });

  it('names where the grade comes from', () => {
    expect(healthSources({ nutriScore: 'c', nutriScoreEstimated: true, nova: 4 })).toBe(
      'Nutri-Score C (estimé) · NOVA 4',
    );
    expect(healthSources({ nutriScore: null, nutriScoreEstimated: false, nova: null })).toBeNull();
  });

  it('says what is known of the additives', () => {
    expect(additiveStatus({ additivesKnown: 'count', additiveCount: 2 }, true)).toBe(
      '2 additifs, lecture du détail…',
    );
    expect(additiveStatus({ additivesKnown: 'count', additiveCount: 1 }, false)).toBe(
      '1 additif, détail indisponible',
    );
    expect(additiveStatus({ additivesKnown: 'unknown', additiveCount: null }, false)).toContain(
      'inconnus',
    );
    expect(additiveStatus({ additivesKnown: 'list', additiveCount: 0 }, false)).toBeNull();
  });

  it('maps grades and diet verdicts to semantic tones', () => {
    expect(gradeTone('excellent')).toBe('recovery');
    expect(gradeTone('poor')).toBe('risk');
    expect(gradeTone(null)).toBe('muted');
    expect(dietTone('incompatible')).toBe('risk');
    expect(dietTone('uncertain')).toBe('muted');
  });

  it('keeps only the broken diets for a list line', () => {
    expect(
      incompatibleDiets({
        dietFit: [
          { diet: 'vegan', label: 'Végétalien', status: 'incompatible', reason: '' },
          { diet: 'keto', label: 'Cétogène', status: 'compatible', reason: '' },
        ],
      }).map((fit) => fit.label),
    ).toEqual(['Végétalien']);
    expect(incompatibleDiets(null)).toEqual([]);
  });

  it('names each data source listed', () => {
    expect(foodSourcesAttribution([{ source: 'CIQUAL' }, { source: 'OFF' }])).toBe(
      'Table Ciqual 2020, Anses (Licence Ouverte) · Données Open Food Facts (ODbL)',
    );
    expect(foodSourcesAttribution([{ source: 'CUSTOM' }])).toBeNull();
  });

  it('hides a health object with nothing to show', () => {
    expect(shownHealth({ coverage: 'none' })).toBeNull();
    expect(shownHealth({ coverage: 'partial' })).toEqual({ coverage: 'partial' });
    expect(shownHealth(undefined)).toBeNull();
  });
});
