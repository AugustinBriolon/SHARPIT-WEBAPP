'use client';

import { CopyPlus, Plus, RefreshCw, Utensils } from 'lucide-react';
import { Button } from '@sharpit/ui/components/ui/button';
import { InkEmptyState } from '@/components/ui/ink-empty-state';
import { NutritionImportedMeals } from '@/components/nutrition/blocks/nutrition-meals-section';
import {
  FoodMealPlate,
  type FoodEntryActions,
} from '@/components/nutrition/food-log/food-meal-plate';
import type {
  FoodLogDisplay,
  FoodLogMealGroup,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { NutritionMealSummary } from '@sharpit/app/presentation/nutrition-view-model';
import { FoodHealthBadge } from '@/components/nutrition/food-log/food-health';
import { foodLogDayHealth } from '@sharpit/app/lib/nutrition/food-log/meal-health-score';

/** The day's score beside « Repas », from every food logged (ADR-070); nothing until it can speak. */
function DayHealthBadge({ groups }: { groups: FoodLogMealGroup[] }) {
  const { day } = foodLogDayHealth(groups.flatMap((group) => group.entries));
  if (!day || day.score === null) {
    return null;
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      Note du jour
      <FoodHealthBadge health={day} />
    </span>
  );
}

function FoodLogSkeleton() {
  return (
    <section className="analysis-panel rounded-analysis-lg space-y-3 p-4" aria-busy>
      <div className="bg-muted h-4 w-24 animate-pulse rounded-full" />
      <div className="bg-muted h-16 animate-pulse rounded-xl" />
      <div className="bg-muted h-16 animate-pulse rounded-xl" />
    </section>
  );
}

function FirstMealInvitation({
  onAdd,
  onCopyYesterday,
}: {
  onAdd: () => void;
  onCopyYesterday?: () => void;
}) {
  return (
    <InkEmptyState
      description="Cherche un aliment, saisis son code-barres, entre un repas à la main ou reprends ta journée d’hier."
      icon={Utensils}
      title="Rien de noté pour cette journée"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" type="button" variant="highlight" onClick={onAdd}>
            <Plus aria-hidden />
            Ajouter un premier repas
          </Button>
          {onCopyYesterday ? (
            <Button size="sm" type="button" variant="secondary" onClick={onCopyYesterday}>
              <CopyPlus aria-hidden />
              Copier hier
            </Button>
          ) : null}
        </div>
      }
      compact
    />
  );
}

function FoodLogBody({
  display,
  groups,
  importedMeals,
  actions,
  unavailable,
  onAddFirst,
  onCopyDay,
}: FoodLogSectionProps) {
  if (unavailable) {
    return (
      <p className="text-muted-foreground text-sm">
        Journal alimentaire indisponible pour le moment. Réessaie dans un instant.
      </p>
    );
  }
  if (display === 'empty') {
    return <FirstMealInvitation onAdd={onAddFirst} onCopyYesterday={onCopyDay} />;
  }
  if (display === 'imported') {
    return (
      <div className="space-y-3">
        <NutritionImportedMeals meals={importedMeals} />
        <Button size="sm" type="button" variant="secondary" onClick={onAddFirst}>
          <Plus aria-hidden />
          Ajouter un aliment
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <FoodMealPlate key={group.meal} actions={actions} group={group} />
      ))}
    </div>
  );
}

export type FoodLogSectionProps = {
  display: FoodLogDisplay;
  groups: FoodLogMealGroup[];
  importedMeals: NutritionMealSummary[];
  actions: FoodEntryActions;
  loading?: boolean;
  /** The day could not be read: nothing to edit, and no false « nothing logged ». */
  unavailable?: boolean;
  onTargets: () => void;
  /** Opens the import of a MyFitnessPal export (ADR-062). */
  onImport?: () => void;
  /** Only when MyFitnessPal is linked — it then fills the days the log leaves empty. */
  mfpSync?: { syncing: boolean; onSync: () => void } | null;
  /** The first add of a day — the caller picks the meal the hour suggests. */
  onAddFirst: () => void;
  /** Logs the whole day before into an empty day (ADR-071). */
  onCopyDay?: () => void;
};

/** The day's meals: logged, added to, edited — the log is SharpIt's own (ADR-061). */
export function FoodLogSection(props: FoodLogSectionProps) {
  if (props.loading) {
    return <FoodLogSkeleton />;
  }
  return (
    <section className="analysis-panel rounded-analysis-lg space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-section-title">Repas</p>
          {props.display === 'log' ? <DayHealthBadge groups={props.groups} /> : null}
        </div>
        <div className="flex items-center gap-1">
          {props.mfpSync ? (
            <Button
              disabled={props.mfpSync.syncing}
              size="sm"
              type="button"
              variant="ghost"
              onClick={props.mfpSync.onSync}
            >
              <RefreshCw aria-hidden />
              MyFitnessPal
            </Button>
          ) : null}
          {props.onImport ? (
            <Button size="sm" type="button" variant="ghost" onClick={props.onImport}>
              Importer
            </Button>
          ) : null}
          <Button size="sm" type="button" variant="ghost" onClick={props.onTargets}>
            Objectifs
          </Button>
        </div>
      </div>
      <FoodLogBody {...props} />
    </section>
  );
}
