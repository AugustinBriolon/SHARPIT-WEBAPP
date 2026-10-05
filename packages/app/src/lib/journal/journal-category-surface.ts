/**
 * Journal category chromatic codes — soft icon wells + filter chips.
 * Same dosage as sport-identity: flat fill + readable ink. No purple (design law).
 */

import type {
  JournalFilterId,
  JournalTrackableCategory,
} from '@sharpit/app/lib/journal/journal-trackables';

export type JournalCategoryTone = JournalTrackableCategory | 'personnalise';

/** Icon well (prefs list + factor rows). */
export const JOURNAL_CATEGORY_ICON: Record<JournalCategoryTone, string> = {
  automatique: 'bg-primary/15 text-primary',
  sante: 'bg-rose-500/15 text-rose-800 dark:bg-rose-400/20 dark:text-rose-200',
  medicament: 'bg-orange-500/15 text-orange-800 dark:bg-orange-400/20 dark:text-orange-200',
  nutrition: 'bg-amber-500/15 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100',
  complement: 'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200',
  sommeil: 'bg-sky-500/15 text-sky-900 dark:bg-sky-400/20 dark:text-sky-200',
  style_vie: 'bg-teal-500/15 text-teal-800 dark:bg-teal-400/20 dark:text-teal-200',
  comportement: 'bg-amber-800/15 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100',
  bien_etre: 'bg-lime-500/15 text-lime-900 dark:bg-lime-400/20 dark:text-lime-100',
  personnalise: 'bg-muted text-foreground',
};

/** Soft section header wash (analysis panels). */
export const JOURNAL_CATEGORY_HEADER: Record<JournalCategoryTone, string> = {
  automatique: 'bg-primary/6',
  sante: 'bg-rose-500/6 dark:bg-rose-400/10',
  medicament: 'bg-orange-500/6 dark:bg-orange-400/10',
  nutrition: 'bg-amber-500/6 dark:bg-amber-400/10',
  complement: 'bg-emerald-500/6 dark:bg-emerald-400/10',
  sommeil: 'bg-sky-500/6 dark:bg-sky-400/10',
  style_vie: 'bg-teal-500/6 dark:bg-teal-400/10',
  comportement: 'bg-amber-800/6 dark:bg-amber-500/10',
  bien_etre: 'bg-lime-500/6 dark:bg-lime-400/10',
  personnalise: 'bg-muted/40',
};

type FilterChipTone = { idle: string; active: string };

const MUTED_IDLE = 'bg-muted text-muted-foreground hover:text-foreground';
const MUTED_ACTIVE = 'bg-foreground text-background';

/** Filter tabs stay neutral — no category color washes. */
export const JOURNAL_FILTER_CHIP: Record<JournalFilterId, FilterChipTone> = {
  all: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  automatique: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  sante: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  medicament: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  nutrition: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  complement: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  sommeil: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  style_vie: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  comportement: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  bien_etre: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
  personnalise: { idle: MUTED_IDLE, active: MUTED_ACTIVE },
};

/** Day-metric wells keep a readable cue even when catalog category is bien_etre. */
export const JOURNAL_METRIC_ICON = {
  caffeine: 'bg-amber-500/15 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100',
  mood: 'bg-primary/15 text-primary',
  hydration: 'bg-sky-500/15 text-sky-900 dark:bg-sky-400/20 dark:text-sky-200',
  driving: 'bg-muted text-foreground',
} as const;

export function journalCategoryIcon(category: JournalCategoryTone | undefined): string {
  return JOURNAL_CATEGORY_ICON[category ?? 'personnalise'];
}
