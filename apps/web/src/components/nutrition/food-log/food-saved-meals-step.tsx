'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@sharpit/ui/components/ui/button';
import { FoodHealthBadge } from '@/components/nutrition/food-log/food-health';
import type { SavedMealPayload } from '@sharpit/app/lib/nutrition/food-log/food-log-day';

function itemCount(count: number): string {
  return count > 1 ? `${count} aliments` : '1 aliment';
}

function SavedMealRow({
  saved,
  onLog,
  onDelete,
}: {
  saved: SavedMealPayload;
  onLog: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <button
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-3"
        type="button"
        onClick={onLog}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm leading-snug">{saved.name}</span>
          <span className="text-muted-foreground text-data text-xs tabular-nums">
            {itemCount(saved.items.length)} · {saved.kcal} kcal · {Math.round(saved.protein)} g
            protéines
          </span>
        </span>
        {saved.health && saved.health.score !== null ? (
          <FoodHealthBadge health={saved.health} />
        ) : null}
      </button>
      <Button
        aria-label={`Supprimer ${saved.name}`}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

/** « Mes repas »: a meal kept under a name, logged whole in one tap (ADR-071). */
export function FoodSavedMealsStep({
  meals,
  loading,
  error,
  onLog,
  onDelete,
}: {
  meals: SavedMealPayload[];
  loading: boolean;
  error: string | null;
  onLog: (saved: SavedMealPayload) => void;
  onDelete: (saved: SavedMealPayload) => void;
}) {
  if (loading) {
    return <div className="bg-muted h-24 animate-pulse rounded-xl" aria-busy />;
  }
  return (
    <div className="space-y-3">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {meals.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun repas enregistré. Depuis un repas de ta journée, « Enregistrer ce repas » le garde
          ici pour le noter d’un geste.
        </p>
      ) : (
        <ul className="divide-analysis-border/15 divide-y">
          {meals.map((saved) => (
            <SavedMealRow
              key={saved.id}
              saved={saved}
              onDelete={() => onDelete(saved)}
              onLog={() => onLog(saved)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
