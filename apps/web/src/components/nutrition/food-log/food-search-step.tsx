'use client';

import { useRef } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@sharpit/ui/components/ui/button';
import { Input } from '@/components/ui/input';
import { FoodBarcodeField } from '@/components/nutrition/food-log/food-barcode-field';
import { FoodSearchResults } from '@/components/nutrition/food-log/food-search-results';
import type { FoodSearchListing } from '@/components/nutrition/food-log/food-add-flow-state';
import { useDesktopAutofocus } from '@/hooks/use-desktop-autofocus';
import type {
  FoodProductPayload,
  FoodSearchPayload,
  RecentFoodPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';

export type FoodSearchStepProps = {
  query: string;
  listing: FoodSearchListing;
  results: FoodSearchPayload | undefined;
  recent: RecentFoodPayload[];
  searchError: string | null;
  barcodePending: boolean;
  onQuery: (query: string) => void;
  onPick: (product: FoodProductPayload) => void;
  onBarcode: (code: string) => void;
  onQuick: () => void;
  onCustom: () => void;
  onMine: () => void;
  onMeals: () => void;
  onRecipe: () => void;
};

function SearchInput({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutofocus(inputRef, true);
  return (
    <div className="relative">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        ref={inputRef}
        aria-label="Chercher un aliment"
        autoComplete="off"
        className="pl-8"
        maxLength={80}
        placeholder="Skyr, pain complet, banane…"
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
    </div>
  );
}

/** Find a food by name or barcode — or step aside to type a meal or create a food. */
export function FoodSearchStep(props: FoodSearchStepProps) {
  return (
    <div className="space-y-4">
      <SearchInput query={props.query} onQuery={props.onQuery} />
      <div className="max-h-[40dvh] min-h-24 overflow-y-auto">
        <FoodSearchResults
          error={props.searchError}
          listing={props.listing}
          recent={props.recent}
          results={props.results}
          onPick={props.onPick}
        />
      </div>
      <FoodBarcodeField pending={props.barcodePending} onSubmit={props.onBarcode} />
      <div className="border-border/60 flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" type="button" variant="ghost" onClick={props.onMeals}>
          Mes repas
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={props.onMine}>
          Mes aliments
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={props.onQuick}>
          Saisie rapide
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={props.onCustom}>
          Créer un aliment
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={props.onRecipe}>
          Créer une recette
        </Button>
      </div>
    </div>
  );
}
