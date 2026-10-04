'use client';

import { FoodProductList } from '@/components/nutrition/food-log/food-product-list';
import type { FoodSearchListing } from '@/components/nutrition/food-log/food-add-flow-state';
import type {
  FoodProductPayload,
  FoodSearchPayload,
  RecentFoodPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import { foodSourcesAttribution } from '@sharpit/app/lib/nutrition/food-log/food-health-view';

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground px-2 py-3 text-sm">{children}</p>;
}

function SearchResults({
  results,
  onPick,
}: {
  results: FoodSearchPayload;
  onPick: (product: FoodProductPayload) => void;
}) {
  const generic = results.generic ?? [];
  const empty = results.own.length === 0 && generic.length === 0 && results.products.length === 0;
  return (
    <div className="space-y-4">
      <FoodProductList products={results.own} title="Mes aliments" onPick={onPick} />
      <FoodProductList
        footnote={foodSourcesAttribution(generic) ?? undefined}
        products={generic}
        title="Aliments de base"
        onPick={onPick}
      />
      <FoodProductList
        footnote={foodSourcesAttribution(results.products) ?? undefined}
        products={results.products}
        title="Produits"
        onPick={onPick}
      />
      {results.offUnavailable ? (
        <Note>
          Open Food Facts ne répond pas : seuls tes aliments et les aliments de base sont listés.
        </Note>
      ) : null}
      {empty && !results.offUnavailable ? (
        <Note>Aucun aliment trouvé. Crée-le ou passe par la saisie rapide.</Note>
      ) : null}
    </div>
  );
}

/** What the search step lists: recent foods, a hint, an error, or the results. */
export function FoodSearchResults({
  listing,
  results,
  recent,
  error,
  onPick,
}: {
  listing: FoodSearchListing;
  results: FoodSearchPayload | undefined;
  recent: RecentFoodPayload[];
  error: string | null;
  onPick: (product: FoodProductPayload) => void;
}) {
  if (error) {
    return <Note>{error}</Note>;
  }
  if (listing === 'recent') {
    const products = recent.map((item) => item.product);
    return (
      <FoodProductList
        footnote={foodSourcesAttribution(products) ?? undefined}
        products={products}
        title="Récents"
        onPick={onPick}
      />
    );
  }
  if (listing === 'results' && results) {
    return <SearchResults results={results} onPick={onPick} />;
  }
  return <Note>Tape au moins deux lettres pour chercher un aliment.</Note>;
}
