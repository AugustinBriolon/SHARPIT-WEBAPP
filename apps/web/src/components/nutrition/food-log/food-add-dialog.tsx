'use client';

import { Button } from '@sharpit/ui/components/ui/button';
import { NavArrowLeft } from '@/components/icons/nav-arrows';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FoodCustomStep } from '@/components/nutrition/food-log/food-custom-step';
import { FoodOwnFoodsStep } from '@/components/nutrition/food-log/food-own-foods-step';
import { FoodPortionStep } from '@/components/nutrition/food-log/food-portion-step';
import { FoodQuickStep } from '@/components/nutrition/food-log/food-quick-step';
import { FoodSearchStep } from '@/components/nutrition/food-log/food-search-step';
import {
  previousFoodAddStep,
  type FoodAddStep,
} from '@/components/nutrition/food-log/food-add-flow-state';
import type { FoodAddFlow } from '@/components/nutrition/food-log/use-food-add-flow';
import { FOOD_MEAL_LABELS } from '@sharpit/app/lib/nutrition/food-log/food-log-day';

const STEP_TITLES: Record<FoodAddStep, string> = {
  search: 'Ajouter un aliment',
  portion: 'Quantité',
  quick: 'Saisie rapide',
  custom: 'Créer un aliment',
  mine: 'Mes aliments',
  editFood: 'Modifier l’aliment',
};

function FoodAddStepBody({ flow }: { flow: FoodAddFlow }) {
  const { state } = flow;
  if (state.step === 'portion' && state.picked) {
    return (
      <FoodPortionStep
        completing={flow.completing}
        error={state.error}
        grams={state.grams}
        meal={state.meal}
        picked={state.picked}
        onGrams={flow.setGrams}
        onMeal={flow.setMeal}
        onSubmit={flow.logPortion}
      />
    );
  }
  if (state.step === 'quick') {
    return (
      <FoodQuickStep
        error={state.error}
        meal={state.meal}
        onMeal={flow.setMeal}
        onSubmit={flow.logQuick}
      />
    );
  }
  if (state.step === 'mine') {
    return (
      <FoodOwnFoodsStep
        error={state.error ?? flow.ownFoodsError}
        foods={flow.ownFoods}
        loading={flow.ownFoodsLoading}
        onCreate={() => flow.showStep('custom')}
        onDelete={flow.deleteFood}
        onEdit={flow.editFood}
        onPick={flow.pickProduct}
      />
    );
  }
  if (state.step === 'editFood' && state.editing) {
    return (
      <FoodCustomStep
        key={state.editing.id}
        error={state.error}
        food={state.editing}
        pending={flow.editPending}
        onSubmit={flow.saveFood}
      />
    );
  }
  if (state.step === 'custom') {
    return (
      <FoodCustomStep error={state.error} pending={flow.customPending} onSubmit={flow.createFood} />
    );
  }
  return (
    <FoodSearchStep
      barcodePending={flow.barcodePending}
      listing={flow.listing}
      query={state.query}
      recent={flow.recent}
      results={flow.results}
      searchError={flow.searchError}
      onBarcode={flow.lookupBarcode}
      onCustom={() => flow.showStep('custom')}
      onMine={() => flow.showStep('mine')}
      onPick={flow.pickProduct}
      onQuery={flow.setQuery}
      onQuick={() => flow.showStep('quick')}
    />
  );
}

/** Search → portion, with the quick add and the custom food one step aside (ADR-061). */
export function FoodAddDialog({ flow }: { flow: FoodAddFlow }) {
  const { state } = flow;
  return (
    <Dialog open={state.open} onOpenChange={(open) => (open ? null : flow.close())}>
      <DialogContent className="flex max-h-[min(92dvh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-5 py-3 pr-12 text-left">
          <div className="flex items-center gap-2">
            {state.step === 'search' ? null : (
              <Button
                aria-label="Retour"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => flow.showStep(previousFoodAddStep(state.step))}
              >
                <NavArrowLeft className="size-4" aria-hidden />
              </Button>
            )}
            <DialogTitle className="font-heading text-base">{STEP_TITLES[state.step]}</DialogTitle>
          </div>
          <DialogDescription className="text-xs">{FOOD_MEAL_LABELS[state.meal]}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <FoodAddStepBody flow={flow} />
        </div>
      </DialogContent>
      {flow.confirmDialog}
    </Dialog>
  );
}
