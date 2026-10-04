'use client';

import { Button } from '@sharpit/ui/components/ui/button';
import { FoodNumberField } from '@/components/nutrition/food-log/food-number-field';
import { FoodTextField } from '@/components/nutrition/food-log/food-quick-step';
import { targetFieldValue } from '@/components/nutrition/food-log/food-log-forms';
import { FoodHealthDetails, FoodHealthSummary } from '@/components/nutrition/food-log/food-health';
import { shownHealth } from '@sharpit/app/lib/nutrition/food-log/food-health-view';
import type { FoodProductPayload } from '@sharpit/app/lib/nutrition/food-log/food-log-day';

/** Optional label lines: with the last three, the Sharpit score reads the whole label. */
const LABEL_DETAIL_FIELDS = [
  { name: 'fiberPer100g', label: 'Fibres' },
  { name: 'sugarPer100g', label: 'Sucres' },
  { name: 'saltPer100g', label: 'Sel' },
  { name: 'saturatedFatPer100g', label: 'Graisses saturées' },
] as const satisfies ReadonlyArray<{ name: keyof FoodProductPayload; label: string }>;

/** The athlete's own food, per 100 g — kept for the next searches; prefilled when edited. */
export function FoodCustomStep({
  pending,
  error,
  food,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  /** The own food being edited; none when one is created. */
  food?: FoodProductPayload | null;
  onSubmit: (form: FormData) => void;
}) {
  const health = shownHealth(food?.health);
  const value = (field: keyof FoodProductPayload) =>
    food ? targetFieldValue(food[field] as number | null | undefined) : undefined;
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <FoodTextField defaultValue={food?.name} label="Nom" name="name" required />
      <FoodTextField defaultValue={food?.brand ?? undefined} label="Marque" name="brand" />
      <p className="text-label text-muted-foreground">Pour 100 g</p>
      <div className="grid grid-cols-2 gap-3">
        <FoodNumberField
          defaultValue={value('kcalPer100g')}
          label="Calories"
          name="kcalPer100g"
          unit="kcal"
          required
        />
        <FoodNumberField
          defaultValue={value('proteinPer100g')}
          label="Protéines"
          name="proteinPer100g"
          unit="g"
          required
        />
        <FoodNumberField
          defaultValue={value('carbsPer100g')}
          label="Glucides"
          name="carbsPer100g"
          unit="g"
          required
        />
        <FoodNumberField
          defaultValue={value('fatPer100g')}
          label="Lipides"
          name="fatPer100g"
          unit="g"
          required
        />
        {LABEL_DETAIL_FIELDS.map((field) => (
          <FoodNumberField
            key={field.name}
            defaultValue={value(field.name)}
            label={field.label}
            name={field.name}
            unit="g"
          />
        ))}
        <FoodNumberField
          defaultValue={value('servingGrams')}
          label="Portion habituelle"
          name="servingGrams"
          unit="g"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Fibres, sucres, sel et graisses saturées sont optionnels ; avec les trois derniers, le score
        Sharpit lit tout l’aliment.
      </p>
      {food ? (
        <p className="text-muted-foreground text-xs">Tes repas déjà notés gardent leurs valeurs.</p>
      ) : null}
      {health ? (
        <section className="border-analysis-border/15 space-y-3 border-t pt-4">
          <p className="text-label text-muted-foreground">Score Sharpit</p>
          <FoodHealthSummary health={health} />
          <FoodHealthDetails health={health} />
        </section>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex justify-end">
        <Button disabled={pending} type="submit" variant="highlight">
          {food ? 'Enregistrer' : 'Créer l’aliment'}
        </Button>
      </div>
    </form>
  );
}
