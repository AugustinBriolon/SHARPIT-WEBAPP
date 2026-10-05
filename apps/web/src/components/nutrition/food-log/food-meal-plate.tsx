'use client';

import { BookmarkPlus, CopyPlus, MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@sharpit/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isTempId } from '@/client/query/optimistic';
import { ColoredMacroPills } from '@/components/nutrition/nutrition-macro-display';
import { FoodEntryRow } from '@/components/nutrition/food-log/food-entry-row';
import { FoodHealthBadge } from '@/components/nutrition/food-log/food-health';
import type { MealHealth } from '@sharpit/app/lib/nutrition/food-log/meal-health-score';
import type {
  FoodLogEntryPayload,
  FoodLogMealGroup,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';

export type FoodEntryActions = {
  onAdd: (meal: FoodMealKey) => void;
  onEdit: (entry: FoodLogEntryPayload) => void;
  onDelete: (entry: FoodLogEntryPayload) => void;
  /** Logs the same meal of the day before into this one (ADR-071). */
  onCopyYesterday?: (meal: FoodMealKey) => void;
  /** Keeps this meal under a name, to log it again in one tap. */
  onSaveMeal?: (group: FoodLogMealGroup) => void;
};

/** What the meal's score rests on, in a line: « Protéines au rendez-vous · 32 g dans le repas ». */
export function MealHealthLine({ health }: { health: MealHealth | null }) {
  const shown = health?.highlights.slice(0, 2) ?? [];
  if (shown.length === 0) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-xs">
      {shown
        .map((highlight) =>
          highlight.detail ? `${highlight.label} · ${highlight.detail}` : highlight.label,
        )
        .join(' — ')}
    </p>
  );
}

/** What else a meal does: come back from yesterday, or be kept for another day. */
function MealPlateMenu({ group, actions }: { group: FoodLogMealGroup; actions: FoodEntryActions }) {
  const { onCopyYesterday, onSaveMeal } = actions;
  if (!onCopyYesterday && !onSaveMeal) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Plus d’actions : ${group.label}`}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {onCopyYesterday ? (
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() => onCopyYesterday(group.meal)}
          >
            <CopyPlus className="size-3.5" aria-hidden />
            Copier le repas d’hier
          </DropdownMenuItem>
        ) : null}
        {onSaveMeal && group.entries.length > 0 ? (
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onSaveMeal(group)}>
            <BookmarkPlus className="size-3.5" aria-hidden />
            Enregistrer ce repas
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MealPlateHeader({
  group,
  actions,
}: {
  group: FoodLogMealGroup;
  actions: FoodEntryActions;
}) {
  const hasEntries = group.entries.length > 0;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{group.label}</p>
        {hasEntries ? (
          <ColoredMacroPills carbs={group.carbs} fat={group.fat} protein={group.protein} />
        ) : null}
        <MealHealthLine health={group.health} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasEntries ? (
          <span className="text-data text-sm font-semibold tabular-nums">{group.kcal} kcal</span>
        ) : null}
        {group.health && group.health.score !== null ? (
          <FoodHealthBadge health={group.health} />
        ) : null}
        <Button
          aria-label={`Ajouter un aliment : ${group.label}`}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => actions.onAdd(group.meal)}
        >
          <Plus aria-hidden />
          Ajouter
        </Button>
        <MealPlateMenu actions={actions} group={group} />
      </div>
    </div>
  );
}

/** One meal of the logged day: its totals, its entries, and where to add to it. */
export function FoodMealPlate({
  group,
  actions,
}: {
  group: FoodLogMealGroup;
  actions: FoodEntryActions;
}) {
  return (
    <div className="border-analysis-border/20 rounded-xl border px-3 py-3 sm:px-4">
      <MealPlateHeader actions={actions} group={group} />
      {group.entries.length > 0 ? (
        <ul className="border-analysis-border/15 divide-analysis-border/15 mt-2 divide-y border-t">
          {group.entries.map((entry) => (
            <FoodEntryRow
              key={entry.id}
              entry={entry}
              saving={isTempId(entry.id)}
              onDelete={actions.onDelete}
              onEdit={actions.onEdit}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
