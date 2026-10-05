'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@sharpit/ui/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColoredMacroPills } from '@/components/nutrition/nutrition-macro-display';
import { FoodNumberField } from '@/components/nutrition/food-log/food-number-field';
import { FoodProductList } from '@/components/nutrition/food-log/food-product-list';
import {
  recipeDraftFrom,
  recipeDraftPreview,
  withIngredient,
  withIngredientGrams,
  withoutIngredient,
  type RecipeDraft,
  type RecipeDraftIngredient,
} from '@/components/nutrition/food-log/recipe-draft';
import { useFoodSearch } from '@/hooks/use-data';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type {
  FoodProductPayload,
  FoodSearchPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';

const SEARCH_DEBOUNCE_MS = 350;
const MAX_HITS = 8;

/** Every list of a search, as one list of foods; a recipe is never its own ingredient. */
export function ingredientHits(
  results: FoodSearchPayload | undefined,
  excludeId: string | null,
): FoodProductPayload[] {
  if (!results) {
    return [];
  }
  return [
    ...(results.eaten ?? []).map((item) => item.product),
    ...results.own,
    ...(results.generic ?? []),
    ...results.products,
  ]
    .filter((product) => product.id !== excludeId)
    .slice(0, MAX_HITS);
}

function IngredientRow({
  item,
  onGrams,
  onRemove,
}: {
  item: RecipeDraftIngredient;
  onGrams: (grams: string) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">{item.food.name}</span>
      <Input
        aria-label={`Grammes de ${item.food.name}`}
        autoComplete="off"
        className="text-data w-20 tabular-nums"
        inputMode="decimal"
        value={item.grams}
        onChange={(event) => onGrams(event.target.value)}
      />
      <span className="text-muted-foreground text-xs">g</span>
      <Button
        aria-label={`Retirer ${item.food.name}`}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onRemove}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

function IngredientSearch({
  excludeId,
  onPick,
}: {
  excludeId: string | null;
  onPick: (product: FoodProductPayload) => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const search = useFoodSearch(debounced);
  const hits = query.trim().length >= 2 ? ingredientHits(search.data, excludeId) : [];
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          aria-label="Chercher un ingrédient"
          autoComplete="off"
          className="pl-8"
          maxLength={80}
          placeholder="Ajouter un ingrédient…"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <FoodProductList
        products={hits}
        title="Résultats"
        onPick={(product) => {
          onPick(product);
          setQuery('');
        }}
      />
    </div>
  );
}

function RecipePreview({ draft }: { draft: RecipeDraft }) {
  const label = recipeDraftPreview(draft);
  if (!label) {
    return (
      <p className="analysis-panel-alt text-muted-foreground rounded-lg px-3 py-2.5 text-sm">
        Ajoute des ingrédients et leurs grammes : la valeur nutritive suit.
      </p>
    );
  }
  const serving = label.servingGrams;
  return (
    <div aria-live="polite" className="analysis-panel-alt space-y-1.5 rounded-lg px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-data text-lg font-semibold tabular-nums">
          {Math.round(label.kcalPer100g)} kcal
          <span className="text-muted-foreground text-xs font-normal"> / 100 g</span>
        </span>
        <ColoredMacroPills
          carbs={label.carbsPer100g}
          fat={label.fatPer100g}
          protein={label.proteinPer100g}
        />
      </div>
      <p className="text-muted-foreground text-data text-xs tabular-nums">
        {Math.round(label.totalGrams)} g en tout
        {serving
          ? ` · 1 part · ${Math.round(serving)} g · ${Math.round((label.kcalPer100g * serving) / 100)} kcal`
          : ''}
      </p>
    </div>
  );
}

/**
 * A recipe built from other foods (ADR-071): its label is theirs summed over the dish's weight,
 * cooked when the athlete weighed it. Saved, it is an own food like any other.
 */
export function FoodRecipeStep({
  recipe,
  pending,
  error,
  onSubmit,
}: {
  /** The recipe being edited; none when one is created. */
  recipe: FoodProductPayload | null;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: RecipeDraft) => void;
}) {
  const [draft, setDraft] = useState(() => recipeDraftFrom(recipe));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="food-recipe-name">
          Nom
        </label>
        <Input
          autoComplete="off"
          id="food-recipe-name"
          maxLength={120}
          placeholder="Bolognaise maison, porridge du matin…"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-label text-muted-foreground">Ingrédients, pesés crus</p>
        {draft.ingredients.length > 0 ? (
          <ul className="divide-analysis-border/15 divide-y">
            {draft.ingredients.map((item) => (
              <IngredientRow
                key={item.food.productId}
                item={item}
                onRemove={() => setDraft(withoutIngredient(draft, item.food.productId))}
                onGrams={(grams) =>
                  setDraft(withIngredientGrams(draft, item.food.productId, grams))
                }
              />
            ))}
          </ul>
        ) : null}
        <IngredientSearch
          excludeId={recipe?.id ?? null}
          onPick={(product) => setDraft(withIngredient(draft, product))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FoodNumberField
          label="Poids cuit"
          name="cookedGrams"
          unit="g, facultatif"
          value={draft.cookedGrams}
          onChange={(cookedGrams) => setDraft({ ...draft, cookedGrams })}
        />
        <FoodNumberField
          label="Parts"
          name="servings"
          unit="facultatif"
          value={draft.servings}
          onChange={(servings) => setDraft({ ...draft, servings })}
        />
      </div>
      <RecipePreview draft={draft} />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button className="w-full" disabled={pending} type="submit">
        {recipe ? 'Enregistrer la recette' : 'Créer la recette'}
      </Button>
    </form>
  );
}
