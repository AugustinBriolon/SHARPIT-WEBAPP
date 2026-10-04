'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@sharpit/ui/components/ui/button';
import { ColoredMacroPills } from '@/components/nutrition/nutrition-macro-display';
import { FoodHealthBadge } from '@/components/nutrition/food-log/food-health';
import type { FoodLogEntryPayload } from '@sharpit/app/lib/nutrition/food-log/food-log-day';

function formatGrams(grams: number): string {
  return `${grams.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`;
}

export function FoodEntryRow({
  entry,
  saving = false,
  onEdit,
  onDelete,
}: {
  entry: FoodLogEntryPayload;
  /** Shown before the server has it: it has no id yet to edit or delete. */
  saving?: boolean;
  onEdit: (entry: FoodLogEntryPayload) => void;
  onDelete: (entry: FoodLogEntryPayload) => void;
}) {
  return (
    <li className="flex items-start gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-foreground/90 leading-snug">{entry.name}</p>
        <p className="text-muted-foreground text-xs">
          {entry.brand ? `${entry.brand} · ` : null}
          <span className="text-data tabular-nums">{formatGrams(entry.grams)}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-data flex items-center justify-end gap-2 font-medium tabular-nums">
          {entry.health ? <FoodHealthBadge health={entry.health} /> : null}
          {Math.round(entry.kcal)} kcal
        </p>
        <ColoredMacroPills
          carbs={entry.carbs}
          className="mt-0.5 justify-end"
          fat={entry.fat}
          protein={entry.protein}
        />
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          aria-label={`Modifier ${entry.name}`}
          disabled={saving}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => onEdit(entry)}
        >
          <Pencil aria-hidden />
        </Button>
        <Button
          aria-label={`Supprimer ${entry.name}`}
          disabled={saving}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => onDelete(entry)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}
