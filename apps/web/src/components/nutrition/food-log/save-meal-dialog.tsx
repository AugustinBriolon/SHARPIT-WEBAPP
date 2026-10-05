'use client';

import { Button } from '@sharpit/ui/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  savedMealDefaultName,
  type FoodLogMealGroup,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';

/** Names a meal to keep it in « Mes repas »; its foods prefill the name (ADR-071). */
export function SaveMealDialog({
  group,
  onClose,
  onSave,
}: {
  /** The meal to keep; the dialog is closed without one. */
  group: FoodLogMealGroup | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  return (
    <Dialog open={group !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">Enregistrer ce repas</DialogTitle>
          <DialogDescription>
            Il sera dans « Mes repas », à noter d’un geste un autre jour.
          </DialogDescription>
        </DialogHeader>
        {group ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
              if (name) {
                onSave(name);
              }
            }}
          >
            <Input
              aria-label="Nom du repas"
              autoComplete="off"
              defaultValue={savedMealDefaultName(group.entries)}
              maxLength={80}
              name="name"
              required
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
