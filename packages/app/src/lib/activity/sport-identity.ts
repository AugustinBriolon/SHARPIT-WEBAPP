import { ActivityType } from '@prisma/client';

/**
 * Sport identity — one chromatic family per ActivityType.
 * Single source for list chips, calendar codes, and activity detail accents.
 *
 * | Sport     | Hue family | Why                                      |
 * |-----------|------------|------------------------------------------|
 * | RUN       | orange     | classic endurance / road                 |
 * | BIKE      | emerald    | ride / leaf-adjacent without brand lime  |
 * | SWIM      | sky        | water                                    |
 * | STRENGTH  | rose       | body / load — distinct from status red   |
 * | TRIATHLON | teal       | bridge swim↔bike — not a single-sport hue|
 * | HIKE      | amber      | earth / trail — distinct from RUN orange |
 * | OTHER     | muted      | neutral                                  |
 *
 * Never reuse Lime Pulse here — highlight stays brand punctuation (nav, badges).
 */
export const SPORT_IDENTITY_SURFACE: Record<ActivityType, string> = {
  RUN: 'bg-orange-500/20 text-orange-800 dark:bg-orange-400/25 dark:text-orange-200 border-orange-500/35 border',
  BIKE: 'bg-emerald-500/20 text-emerald-800 dark:bg-emerald-400/25 dark:text-emerald-200 border-emerald-500/35 border',
  SWIM: 'bg-sky-500/20 text-sky-900 dark:bg-sky-400/25 dark:text-sky-200 border-sky-500/35 border',
  STRENGTH:
    'bg-rose-500/20 text-rose-800 dark:bg-rose-400/25 dark:text-rose-200 border-rose-500/35 border',
  TRIATHLON:
    'bg-teal-500/20 text-teal-800 dark:bg-teal-400/25 dark:text-teal-200 border-teal-500/35 border',
  HIKE: 'bg-amber-800/20 text-amber-950 dark:bg-amber-500/25 dark:text-amber-100 border-amber-800/35 border',
  OTHER: 'bg-muted text-foreground border',
};

/** Text-only accents (detail pages, links, icons). */
export const SPORT_IDENTITY_TEXT: Record<ActivityType, string> = {
  RUN: 'text-orange-700 dark:text-orange-300',
  BIKE: 'text-emerald-700 dark:text-emerald-300',
  SWIM: 'text-sky-700 dark:text-sky-300',
  STRENGTH: 'text-rose-700 dark:text-rose-300',
  TRIATHLON: 'text-teal-700 dark:text-teal-300',
  HIKE: 'text-amber-800 dark:text-amber-200',
  OTHER: 'text-muted-foreground',
};

/** Soft border / ring accents for detail chrome. */
export const SPORT_IDENTITY_BORDER: Record<ActivityType, string> = {
  RUN: 'border-orange-500/35',
  BIKE: 'border-emerald-500/35',
  SWIM: 'border-sky-500/35',
  STRENGTH: 'border-rose-500/35',
  TRIATHLON: 'border-teal-500/35',
  HIKE: 'border-amber-800/35',
  OTHER: 'border-border',
};

/**
 * Concrete hex for MapLibre / canvas — CSS vars are rejected by map paint props.
 * Keep aligned with `--sport-*` in globals.css and the Tailwind families above.
 */
export const SPORT_IDENTITY_HEX: Record<ActivityType, string> = {
  RUN: '#ea580c',
  BIKE: '#059669',
  SWIM: '#0284c7',
  STRENGTH: '#e11d48',
  TRIATHLON: '#0d9488',
  HIKE: '#b45309',
  OTHER: '#2f6b28',
};

/**
 * Solid sport fill + paired on-sport foreground (WCAG AA).
 * Ink on run/bike/swim/triathlon; snow on strength/hike/other.
 * Prefer this over `text-white` on sport hex backgrounds.
 */
export const SPORT_IDENTITY_SOLID: Record<ActivityType, string> = {
  RUN: 'bg-sport-run text-on-sport-run',
  BIKE: 'bg-sport-bike text-on-sport-bike',
  SWIM: 'bg-sport-swim text-on-sport-swim',
  STRENGTH: 'bg-sport-strength text-on-sport-strength',
  TRIATHLON: 'bg-sport-triathlon text-on-sport-triathlon',
  HIKE: 'bg-sport-hike text-on-sport-hike',
  OTHER: 'bg-sport-other text-on-sport-other',
};

/** Analysis-panel tint for hero metric cards on activity detail. */
export const SPORT_IDENTITY_PANEL: Record<ActivityType, string> = {
  RUN: 'border-orange-500/30 bg-orange-500/5 dark:border-orange-400/40 dark:bg-orange-400/15',
  BIKE: 'border-emerald-500/30 bg-emerald-500/5 dark:border-emerald-400/40 dark:bg-emerald-400/15',
  SWIM: 'border-sky-500/30 bg-sky-500/5 dark:border-sky-400/40 dark:bg-sky-400/15',
  STRENGTH: 'border-rose-500/30 bg-rose-500/5 dark:border-rose-400/40 dark:bg-rose-400/15',
  TRIATHLON: 'border-teal-500/30 bg-teal-500/5 dark:border-teal-400/40 dark:bg-teal-400/15',
  HIKE: 'border-amber-800/30 bg-amber-800/5 dark:border-amber-500/40 dark:bg-amber-500/15',
  OTHER: 'border-analysis-border dark:bg-analysis-surface-alt',
};

export function sportIdentitySurface(type: ActivityType): string {
  return SPORT_IDENTITY_SURFACE[type];
}

export function sportIdentityText(type: ActivityType): string {
  return SPORT_IDENTITY_TEXT[type];
}

export function sportIdentityPanel(type: ActivityType): string {
  return SPORT_IDENTITY_PANEL[type];
}

export function sportIdentityHex(type: ActivityType): string {
  return SPORT_IDENTITY_HEX[type] ?? SPORT_IDENTITY_HEX.OTHER;
}

export function sportIdentitySolid(type: ActivityType): string {
  return SPORT_IDENTITY_SOLID[type] ?? SPORT_IDENTITY_SOLID.OTHER;
}
