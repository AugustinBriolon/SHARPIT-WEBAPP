import { isSet } from '@sharpit/shared/value';
export type MultisportLegKind = 'swim' | 'bike' | 'run' | 'transition';

export interface MultisportLeg {
  kind: MultisportLegKind;
  label: string;
  durationSec: number;
  movingDurationSec: number | null;
  distanceM: number | null;
  avgHr: number | null;
  avgSpeedMs: number | null;
  elevationM: number | null;
  calories: number | null;
  garminActivityId: string | null;
  /** 1 ou 2 pour les transitions T1 / T2 */
  transitionIndex: number | null;
  /** Hidden leg row a Strava/Apple-built triathlon was assembled from; absent on Garmin legs and old JSON. */
  sourceActivityId?: string | null;
}

export function isMultisportLegArray(value: unknown): value is MultisportLeg[] {
  return (
    Array.isArray(value) &&
    value.every(
      (leg) =>
        isSet(leg) &&
        typeof leg === 'object' &&
        typeof (leg as MultisportLeg).kind === 'string' &&
        typeof (leg as MultisportLeg).label === 'string' &&
        typeof (leg as MultisportLeg).durationSec === 'number',
    )
  );
}

export function mapGarminChildTypeToKind(typeKey: string): MultisportLegKind {
  const k = typeKey.toLowerCase();
  if (k.includes('transition')) {
    return 'transition';
  }
  if (k.includes('swim')) {
    return 'swim';
  }
  if (k.includes('cycl') || k.includes('bike') || k.includes('ride')) {
    return 'bike';
  }
  if (k.includes('run')) {
    return 'run';
  }
  return 'run';
}

export function legKindLabel(kind: MultisportLegKind, transitionIndex: number | null): string {
  switch (kind) {
    case 'swim':
      return 'Natation';
    case 'bike':
      return 'Vélo';
    case 'run':
      return 'Course';
    case 'transition':
      return transitionIndex === 2 ? 'T2' : 'T1';
  }
}

export function sportLegsOnly(legs: MultisportLeg[]): MultisportLeg[] {
  return legs.filter((leg) => leg.kind !== 'transition');
}

export function transitionLegs(legs: MultisportLeg[]): MultisportLeg[] {
  return legs.filter((leg) => leg.kind === 'transition');
}

/** Temps affiché pour une transition : mouvement réel (T1/T2 actif), pas le temps zone. */
export function legDisplayDurationSec(leg: MultisportLeg): number {
  if (leg.kind === 'transition' && isSet(leg.movingDurationSec) && leg.movingDurationSec > 0) {
    return leg.movingDurationSec;
  }
  return leg.durationSec;
}

export function totalTransitionSec(legs: MultisportLeg[]): number {
  return transitionLegs(legs).reduce((sum, leg) => sum + legDisplayDurationSec(leg), 0);
}

export function legKindToActivityType(
  kind: MultisportLegKind,
): import('@prisma/client').ActivityType | null {
  switch (kind) {
    case 'swim':
      return 'SWIM';
    case 'bike':
      return 'BIKE';
    case 'run':
      return 'RUN';
    default:
      return null;
  }
}
