'use client';

import { BellIcon } from 'lucide-react';
import { Button } from '@sharpit/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@sharpit/app/lib/utils';
import {
  WELLNESS_UI_SCALE,
  type WellnessUiScore,
} from '@sharpit/app/lib/journal/morning-wellness-scale';
import type { MorningWellnessDraft } from '@sharpit/app/lib/journal/morning-wellness-optimistic';
import { useMorningCheckIn } from '@/hooks/use-morning-check-in';

type ScaleKey = keyof Pick<
  MorningWellnessDraft,
  'mood' | 'energyLevel' | 'perceivedSoreness' | 'stressLevel'
>;

const SCALES: { key: ScaleKey; label: string; hint: string }[] = [
  { key: 'mood', label: 'Humeur', hint: 'Comment tu te sens' },
  { key: 'energyLevel', label: 'Énergie', hint: 'Niveau au réveil' },
  { key: 'perceivedSoreness', label: 'Corps', hint: 'Courbatures' },
  { key: 'stressLevel', label: 'Stress', hint: 'Charge mentale' },
];

function emptyDraft(): MorningWellnessDraft {
  return {
    mood: 3,
    energyLevel: 3,
    perceivedSoreness: 3,
    stressLevel: 3,
    notes: '',
  };
}

function ScaleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: WellnessUiScore;
  onChange: (value: WellnessUiScore) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <div aria-label={label} className="flex gap-1.5" role="group">
        {WELLNESS_UI_SCALE.map((score) => {
          const selected = value === score;
          return (
            <button
              key={score}
              aria-pressed={selected}
              type="button"
              className={cn(
                'focus-visible:ring-primary/35 h-9 min-w-9 flex-1 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onChange(score)}
            >
              {score}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Reminder bell + « Ressenti du jour » sheet.
 * Enregistrer is Instant: closes and clears the badge before the network settles.
 */
export function MorningCheckInReminder() {
  const { reminderVisible, state, open, close, setDraft, save } = useMorningCheckIn();
  const draft = state.draft ?? emptyDraft();

  function patch(partial: Partial<MorningWellnessDraft>) {
    setDraft({ ...draft, ...partial });
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      if (!state.draft) {
        setDraft(emptyDraft());
      }
      open();
      return;
    }
    // Keep draft in memory when dismissing the sheet without saving.
    close();
  }

  return (
    <>
      {reminderVisible ? (
        <button
          aria-label="Ressenti du jour"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-primary/35 relative inline-flex size-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
          type="button"
          onClick={() => handleOpenChange(true)}
        >
          <BellIcon className="size-4" aria-hidden />
          <span
            className="bg-primary absolute top-1.5 right-1.5 size-1.5 rounded-full"
            aria-hidden
          />
        </button>
      ) : null}

      <Dialog open={state.sheetOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Ressenti du jour</DialogTitle>
            <DialogDescription>Quatre points, une minute. Affiné le verdict.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {SCALES.map((scale) => (
              <ScaleRow
                key={scale.key}
                hint={scale.hint}
                label={scale.label}
                value={draft[scale.key]}
                onChange={(value) => patch({ [scale.key]: value })}
              />
            ))}

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Note</span>
              <span className="text-muted-foreground block text-xs">Optionnel</span>
              <textarea
                className="border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/35 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
                placeholder="Un détail pour le coach…"
                rows={2}
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
              />
            </label>

            <Button className="w-full" type="button" onClick={() => save(draft)}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
