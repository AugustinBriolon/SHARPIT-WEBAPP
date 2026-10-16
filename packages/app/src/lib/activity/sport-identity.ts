import { ActivityType } from '@prisma/client';

/**
 * Sport identity — Ink & Lime (ADR-085): a sport is told by its icon, never by
 * its colour. Every sport shares the same monochrome treatment; the records stay
 * keyed by ActivityType so callers keep one lookup per sport.
 */
export const SPORT_IDENTITY_SURFACE: Record<ActivityType, string> = {
  RUN: 'bg-chip-surface text-foreground',
  BIKE: 'bg-chip-surface text-foreground',
  SWIM: 'bg-chip-surface text-foreground',
  STRENGTH: 'bg-chip-surface text-foreground',
  TRIATHLON: 'bg-chip-surface text-foreground',
  HIKE: 'bg-chip-surface text-foreground',
  OTHER: 'bg-chip-surface text-foreground',
};

/** Text-only accents (detail pages, links, icons). */
export const SPORT_IDENTITY_TEXT: Record<ActivityType, string> = {
  RUN: 'text-foreground',
  BIKE: 'text-foreground',
  SWIM: 'text-foreground',
  STRENGTH: 'text-foreground',
  TRIATHLON: 'text-foreground',
  HIKE: 'text-foreground',
  OTHER: 'text-foreground',
};

/** Soft border / ring accents for detail chrome. */
export const SPORT_IDENTITY_BORDER: Record<ActivityType, string> = {
  RUN: 'border-border',
  BIKE: 'border-border',
  SWIM: 'border-border',
  STRENGTH: 'border-border',
  TRIATHLON: 'border-border',
  HIKE: 'border-border',
  OTHER: 'border-border',
};

/**
 * Concrete hex for MapLibre / canvas — CSS vars are rejected by map paint props.
 * Keep aligned with `--sport-*` in globals.css.
 */
export const SPORT_IDENTITY_HEX: Record<ActivityType, string> = {
  RUN: '#0e0e0e',
  BIKE: '#0e0e0e',
  SWIM: '#0e0e0e',
  STRENGTH: '#0e0e0e',
  TRIATHLON: '#0e0e0e',
  HIKE: '#0e0e0e',
  OTHER: '#0e0e0e',
};

/** Icon tile: ink squircle with a lime glyph. */
export const SPORT_IDENTITY_SOLID: Record<ActivityType, string> = {
  RUN: 'bg-ink-surface text-ink-accent',
  BIKE: 'bg-ink-surface text-ink-accent',
  SWIM: 'bg-ink-surface text-ink-accent',
  STRENGTH: 'bg-ink-surface text-ink-accent',
  TRIATHLON: 'bg-ink-surface text-ink-accent',
  HIKE: 'bg-ink-surface text-ink-accent',
  OTHER: 'bg-ink-surface text-ink-accent',
};

/** Hero metric cards on activity detail — plain card, no sport tint. */
export const SPORT_IDENTITY_PANEL: Record<ActivityType, string> = {
  RUN: 'border-transparent bg-card',
  BIKE: 'border-transparent bg-card',
  SWIM: 'border-transparent bg-card',
  STRENGTH: 'border-transparent bg-card',
  TRIATHLON: 'border-transparent bg-card',
  HIKE: 'border-transparent bg-card',
  OTHER: 'border-transparent bg-card',
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
