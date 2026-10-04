'use client';

import { Button } from '@sharpit/ui/components/ui/button';
import { FoodMealSelect } from '@/components/nutrition/food-log/food-meal-select';
import { FoodNumberField } from '@/components/nutrition/food-log/food-number-field';
import { FoodNutrientsPreview } from '@/components/nutrition/food-log/food-nutrients-preview';
import { portionPreview } from '@/components/nutrition/food-log/food-log-forms';
import type { PickedFood } from '@/components/nutrition/food-log/food-add-flow-state';
import { portionPresets } from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import { FoodHealthDetails, FoodHealthSummary } from '@/components/nutrition/food-log/food-health';
import {
  foodSourcesAttribution,
  shownHealth,
} from '@sharpit/app/lib/nutrition/food-log/food-health-view';
import { cn } from '@sharpit/app/lib/utils';

function PresetChips({
  picked,
  grams,
  onGrams,
}: {
  picked: PickedFood;
  grams: string;
  onGrams: (grams: string) => void;
}) {
  return (
    <div aria-label="Portions rapides" className="flex flex-wrap gap-2" role="group">
      {portionPresets(picked.product, picked.lastGrams).map((preset) => (
        <button
          key={preset.grams}
          aria-pressed={grams === String(preset.grams)}
          type="button"
          className={cn(
            'chip-surface focus-visible:ring-ring/50 rounded-full px-3 py-1.5 text-xs outline-none focus-visible:ring-3',
            grams === String(preset.grams) && 'border-primary/50 text-foreground font-medium',
          )}
          onClick={() => onGrams(String(preset.grams))}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** How much of the picked food, and in which meal — then it is logged. */
export function FoodPortionStep({
  picked,
  grams,
  meal,
  error,
  completing = false,
  onGrams,
  onMeal,
  onSubmit,
}: {
  picked: PickedFood;
  /** A search hit's additives are being read by barcode. */
  completing?: boolean;
  grams: string;
  meal: FoodMealKey;
  error: string | null;
  onGrams: (grams: string) => void;
  onMeal: (meal: FoodMealKey) => void;
  onSubmit: () => void;
}) {
  const { product } = picked;
  const health = shownHealth(product.health);
  const attribution = foodSourcesAttribution([product]);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-0.5">
        <p className="text-card-title">{product.name}</p>
        {product.brand ? <p className="text-muted-foreground text-xs">{product.brand}</p> : null}
      </div>
      {health ? <FoodHealthSummary health={health} /> : null}
      <PresetChips grams={grams} picked={picked} onGrams={onGrams} />
      <FoodNumberField label="Quantité" name="grams" unit="g" value={grams} onChange={onGrams} />
      <FoodNutrientsPreview nutrients={portionPreview(product, grams)} />
      <FoodMealSelect id="food-portion-meal" value={meal} onChange={onMeal} />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        {attribution ? (
          <p className="text-muted-foreground text-[11px]">{attribution}</p>
        ) : (
          <span />
        )}
        <Button type="submit" variant="highlight">
          Ajouter
        </Button>
      </div>
      {health ? (
        <section
          aria-label="Détail du score Sharpit"
          className="border-analysis-border/15 border-t pt-4"
        >
          <FoodHealthDetails completing={completing} health={health} />
        </section>
      ) : null}
    </form>
  );
}
