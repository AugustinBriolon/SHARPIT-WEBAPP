/** Types extensibles pour la mémoire structurée du coach. */

import type { TravelDiscipline } from '@sharpit/app/lib/travel-context/disciplines';
import {
  TRAVEL_DISCIPLINE_LABELS,
  TRAVEL_DISCIPLINES,
  isTravelDiscipline,
  travelDisciplineLabels,
} from '@sharpit/app/lib/travel-context/disciplines';
import type { TravelTrainingConstraint } from '@sharpit/app/lib/travel-context/training-constraint';
import {
  TRAVEL_TRAINING_CONSTRAINT_LABELS,
  isTravelTrainingConstraint,
  travelTrainingConstraintLabel,
} from '@sharpit/app/lib/travel-context/training-constraint';

/** Structured coach memory via AthleteTravelContext.type (ADR-080). */
export type CoachMemoryType = 'TRAVEL' | 'CONSTRAINT' | 'INJURY' | 'PREFERENCE' | 'NOTE';

/** Types that never auto-purge and may omit an end date (open-ended). */
export const DURABLE_OPEN_ENDED_MEMORY_TYPES: ReadonlySet<CoachMemoryType> = new Set([
  'PREFERENCE',
  'NOTE',
]);

/** Open-ended end date stored for PREFERENCE / NOTE when the athlete leaves end empty. */
export const OPEN_ENDED_MEMORY_END_DAY = '2099-12-31';

export type CoachMemorySource = 'USER' | 'COACH';

export type { TravelTrainingConstraint, TravelDiscipline };

export type CoachMemoryEntry = {
  id: string;
  type: CoachMemoryType;
  source: CoachMemorySource;
  label: string | null;
  locationLabel: string | null;
  locationLat: number | null;
  locationLng: number | null;
  startDate: string;
  endDate: string;
  note: string | null;
  trainingConstraint: TravelTrainingConstraint;
  allowedDisciplines: TravelDiscipline[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TravelMemoryInput = {
  /** Defaults to TRAVEL. CONSTRAINT entries have no location. */
  type?: CoachMemoryType;
  label?: string | null;
  /** Required when type is TRAVEL; ignored for CONSTRAINT. */
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  startDate: Date;
  endDate: Date;
  note?: string | null;
  trainingConstraint?: TravelTrainingConstraint | null;
  allowedDisciplines?: TravelDiscipline[] | null;
  noStructuredTraining?: boolean;
  source?: CoachMemorySource;
  applyToPlannedSessions?: boolean;
};

export const COACH_MEMORY_TYPE_LABELS: Record<CoachMemoryType, string> = {
  TRAVEL: 'Déplacement / voyage',
  CONSTRAINT: 'Contrainte',
  INJURY: 'Blessure / gène',
  PREFERENCE: 'Préférence',
  NOTE: 'Note',
};

export const COACH_MEMORY_SOURCE_LABELS: Record<CoachMemorySource, string> = {
  USER: 'Ajout manuel',
  COACH: 'Déduit du coach',
};

/** Sources worth showing as a badge — USER ("Ajout manuel") is noise, omit it. */
const COACH_MEMORY_SOURCE_BADGE: Partial<Record<CoachMemorySource, string>> = {
  COACH: COACH_MEMORY_SOURCE_LABELS.COACH,
};

export {
  TRAVEL_TRAINING_CONSTRAINT_LABELS,
  TRAVEL_DISCIPLINE_LABELS,
  TRAVEL_DISCIPLINES,
  isTravelTrainingConstraint,
  isTravelDiscipline,
  travelTrainingConstraintLabel,
  travelDisciplineLabels,
};

export function isCoachMemorySource(value: unknown): value is CoachMemorySource {
  return value === 'USER' || value === 'COACH';
}

/** Returns null when source is missing, unknown, or not badge-worthy (USER). */
export function coachMemorySourceLabel(source: unknown): string | null {
  if (!isCoachMemorySource(source)) {
    return null;
  }
  return COACH_MEMORY_SOURCE_BADGE[source] ?? null;
}

export function isCoachMemoryType(value: unknown): value is CoachMemoryType {
  return (
    value === 'TRAVEL' ||
    value === 'CONSTRAINT' ||
    value === 'INJURY' ||
    value === 'PREFERENCE' ||
    value === 'NOTE'
  );
}

export function coachMemoryTypeLabel(type: unknown): string | null {
  if (!isCoachMemoryType(type)) {
    return null;
  }
  return COACH_MEMORY_TYPE_LABELS[type];
}
