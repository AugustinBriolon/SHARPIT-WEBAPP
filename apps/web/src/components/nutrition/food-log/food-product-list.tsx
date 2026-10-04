'use client';

import { FoodDietConflict, FoodHealthBadge } from '@/components/nutrition/food-log/food-health';
import type { FoodProductPayload } from '@sharpit/app/lib/nutrition/food-log/food-log-day';

function productMeta(product: FoodProductPayload): string {
  const kcal = `${Math.round(product.kcalPer100g)} kcal / 100 g`;
  const origin = product.brand ?? (product.source === 'CIQUAL' ? 'Aliment de base' : null);
  return origin ? `${origin} · ${kcal}` : kcal;
}

/** A titled list of foods to pick; each row is a button, so the list is walked with Tab. */
export function FoodProductList({
  title,
  products,
  footnote,
  onPick,
}: {
  title: string;
  products: FoodProductPayload[];
  footnote?: string;
  onPick: (product: FoodProductPayload) => void;
}) {
  if (products.length === 0) {
    return null;
  }
  return (
    <section className="space-y-1.5">
      <p className="text-label text-muted-foreground">{title}</p>
      <ul className="divide-analysis-border/15 divide-y">
        {products.map((product) => (
          <li key={product.id}>
            <button
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-3"
              type="button"
              onClick={() => onPick(product)}
            >
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="text-sm leading-snug">{product.name}</span>
                <span className="text-muted-foreground text-data text-xs tabular-nums">
                  {productMeta(product)}
                </span>
                <FoodDietConflict health={product.health} />
              </span>
              <FoodHealthBadge health={product.health} />
            </button>
          </li>
        ))}
      </ul>
      {footnote ? <p className="text-muted-foreground text-[11px]">{footnote}</p> : null}
    </section>
  );
}
