import {
  Activity,
  Apple,
  CalendarSync,
  Heart,
  Hourglass,
  LayoutGrid,
  MessagesSquare,
  NotebookText,
  Rocket,
  Watch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  INCLUDED_FOR_EVERYONE as INCLUDED_DATA,
  PLANNED_PERKS as PLANNED_DATA,
  PRO_ONLY_PERKS as PRO_ONLY_DATA,
  type ProPerkData,
} from '@sharpit/app/lib/access/pro-perks';

/** A perk as the web Pro page shows it: the shared copy plus its icon. */
export type ProPerk = ProPerkData & { icon: LucideIcon };

const ICONS: Record<string, LucideIcon> = {
  'weekly-review': NotebookText,
  'session-analysis': Activity,
  'journal-coach-read': MessagesSquare,
  'nutrition-reading': Apple,
  'biological-age': Hourglass,
  'watch-push': Watch,
  'extended-coach': MessagesSquare,
  'calendar-sync': CalendarSync,
  'extra-widgets': LayoutGrid,
  'early-access': Rocket,
  support: Heart,
};

const withIcon = (perk: ProPerkData): ProPerk => ({ ...perk, icon: ICONS[perk.id] ?? Activity });

export const PRO_ONLY_PERKS: ProPerk[] = PRO_ONLY_DATA.map(withIcon);
export const INCLUDED_FOR_EVERYONE: ProPerk[] = INCLUDED_DATA.map(withIcon);
export const PLANNED_PERKS: ProPerk[] = PLANNED_DATA.map(withIcon);
