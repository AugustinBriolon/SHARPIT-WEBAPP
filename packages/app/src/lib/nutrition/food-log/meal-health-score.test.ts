import { describe, expect, it } from 'vitest';
import { foodLogDayHealth, mealHealth, type ScorableEntry } from './meal-health-score';

function entry(patch: Partial<ScorableEntry> & { score?: number | null; nova?: 1 | 2 | 3 | 4 }) {
  const { score = null, nova = null, ...rest } = patch;
  return {
    meal: 'LUNCH',
    kcal: 100,
    protein: 0,
    fiber: null,
    health: score === null && nova === null ? null : { score, nova },
    ...rest,
  } as ScorableEntry;
}

describe('mealHealth', () => {
  it('weighs each food by the energy it brings', () => {
    const lunch = mealHealth('LUNCH', [
      entry({ kcal: 600, score: 80 }),
      entry({ kcal: 30, score: 10 }),
      entry({ kcal: 0, score: 0 }),
    ]);
    expect(lunch?.score).toBe(77);
    expect(lunch?.grade).toBe('excellent');
    expect(lunch?.coverage).toBe(1);
  });

  it('gives no number when less than half the energy is scored, and says so', () => {
    const lunch = mealHealth('LUNCH', [entry({ kcal: 300, score: 90 }), entry({ kcal: 500 })]);
    expect(lunch?.score).toBeNull();
    expect(lunch?.highlights).toContainEqual(
      expect.objectContaining({ key: 'partial_coverage', label: 'Pas assez d’aliments notés' }),
    );
  });

  it('names a partial score', () => {
    const lunch = mealHealth('LUNCH', [entry({ kcal: 700, score: 60 }), entry({ kcal: 300 })]);
    expect(lunch?.score).toBe(60);
    expect(lunch?.highlights).toContainEqual(
      expect.objectContaining({
        key: 'partial_coverage',
        detail: "70 % de l'énergie vient d'aliments notés",
      }),
    );
  });

  it('reads the protein of a main meal, never of snacks', () => {
    const rich = mealHealth('DINNER', [
      entry({ meal: 'DINNER', kcal: 500, protein: 32, score: 70 }),
    ]);
    expect(rich?.highlights[0]).toMatchObject({ key: 'meal_protein', tone: 'positive' });
    const poor = mealHealth('LUNCH', [entry({ kcal: 650, protein: 9, score: 50 })]);
    expect(poor?.highlights[0]).toMatchObject({ key: 'meal_protein_low', tone: 'negative' });
    const snack = mealHealth('SNACKS', [
      entry({ meal: 'SNACKS', kcal: 450, protein: 2, score: 40 }),
    ]);
    expect(snack?.highlights).toEqual([]);
  });

  it('names a meal mostly ultra-processed, by energy', () => {
    const lunch = mealHealth('LUNCH', [
      entry({ kcal: 400, score: 30, nova: 4 }),
      entry({ kcal: 200, score: 90, nova: 1 }),
    ]);
    expect(lunch?.ultraProcessedShare).toBe(0.67);
    expect(lunch?.highlights).toContainEqual(
      expect.objectContaining({ key: 'ultra_processed_share', detail: "67 % de l'énergie" }),
    );
  });

  it('is null for an empty meal', () => {
    expect(mealHealth('BREAKFAST', [entry({ kcal: 300, score: 80 })])).toBeNull();
  });
});

describe('foodLogDayHealth', () => {
  it('scores the day across meals and reads its fibre', () => {
    const health = foodLogDayHealth([
      entry({ meal: 'BREAKFAST', kcal: 400, score: 90, fiber: 8 }),
      entry({ meal: 'LUNCH', kcal: 800, score: 60, fiber: 10 }),
    ]);
    expect(health.day?.score).toBe(70);
    expect(health.day?.highlights).toContainEqual(
      expect.objectContaining({ key: 'day_fiber_low', detail: '18 g sur 25 g conseillés' }),
    );
    expect(health.meals.BREAKFAST?.score).toBe(90);
    expect(health.meals.DINNER).toBeNull();
  });

  it('is empty for a day without entries', () => {
    expect(foodLogDayHealth([]).day).toBeNull();
  });
});
