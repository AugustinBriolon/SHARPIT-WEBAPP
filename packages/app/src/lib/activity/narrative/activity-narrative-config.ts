import type { ActivityType } from '@prisma/client';
import { startOfDay } from 'date-fns';

/** Première date incluse pour l'analyse narrative (inclusive, fuseau local). */
export const NARRATIVE_ANALYSIS_SINCE = startOfDay(new Date(2026, 5, 29));

export function isEligibleForActivityNarrative(date: Date): boolean {
  return startOfDay(date).getTime() >= NARRATIVE_ANALYSIS_SINCE.getTime();
}

/** Read on their own after an import or a backfill. */
export const AUTO_NARRATIVE_ACTIVITY_TYPES: readonly ActivityType[] = [
  'RUN',
  'BIKE',
  'SWIM',
  'TRIATHLON',
];

/** Strength is read only when the athlete asks, so imports do not spend tokens on it. */
export const ON_REQUEST_NARRATIVE_ACTIVITY_TYPES: readonly ActivityType[] = [
  ...AUTO_NARRATIVE_ACTIVITY_TYPES,
  'STRENGTH',
];

export function narrativeReadsActivityType(type: ActivityType, onRequest: boolean): boolean {
  const types = onRequest ? ON_REQUEST_NARRATIVE_ACTIVITY_TYPES : AUTO_NARRATIVE_ACTIVITY_TYPES;
  return types.includes(type);
}
