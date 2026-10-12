import {
  type MultisportLeg,
  legDisplayDurationSec,
  legKindLabel,
  legKindToActivityType,
} from '@sharpit/app/lib/activity/multisport';
import { SPORT_IDENTITY_HEX } from '@sharpit/app/lib/activity/sport-identity';
import { formatDistance, formatPace, formatSwimPace } from '@sharpit/app/lib/format';
import { formatChronoSeconds } from '@sharpit/app/lib/goals/goal-metric-config';

/** One leg of a race as the carnet draws it: its name, its time and its share of the whole. */
export type RaceLegView = {
  key: string;
  label: string;
  durationSec: number;
  /** 0–1: the leg's width on the strip. */
  share: number;
  /** Sport identity colour; null for a transition (drawn in the muted ink). */
  color: string | null;
  distance: string | null;
  /** Pace or speed in the sport's own unit; null when it cannot be told. */
  pace: string | null;
  /** The leg's own séance, when the race was built from separate recordings. */
  href: string | null;
};

function legSpeedMs(leg: MultisportLeg, durationSec: number): number | null {
  if (leg.avgSpeedMs && leg.avgSpeedMs > 0) {
    return leg.avgSpeedMs;
  }
  return leg.distanceM && durationSec > 0 ? leg.distanceM / durationSec : null;
}

/** Swim per 100 m, run per km, bike in km/h — the unit each sport is read in. */
export function legPaceText(leg: MultisportLeg): string | null {
  const speed = legSpeedMs(leg, legDisplayDurationSec(leg));
  if (!speed) {
    return null;
  }
  switch (leg.kind) {
    case 'swim':
      return formatSwimPace(100 / speed);
    case 'run':
      return formatPace(1000 / speed);
    case 'bike':
      return `${(speed * 3.6).toFixed(1).replace('.', ',')} km/h`;
    case 'transition':
      return null;
  }
}

export function raceLegViews(legs: readonly MultisportLeg[]): RaceLegView[] {
  const total = legs.reduce((sum, leg) => sum + legDisplayDurationSec(leg), 0);
  return legs.map((leg, index) => {
    const durationSec = legDisplayDurationSec(leg);
    const type = legKindToActivityType(leg.kind);
    return {
      key: `${index}-${leg.kind}`,
      label: legKindLabel(leg.kind, leg.transitionIndex),
      durationSec,
      share: total > 0 ? durationSec / total : 0,
      color: type ? SPORT_IDENTITY_HEX[type] : null,
      distance: leg.distanceM ? formatDistance(leg.distanceM) : null,
      pace: legPaceText(leg),
      href: leg.sourceActivityId ? `/seances/${leg.sourceActivityId}` : null,
    };
  });
}

function objectiveText(targetPerformance: string | null): string | null {
  const target = targetPerformance?.trim();
  return target ? `objectif ${target}` : null;
}

/** « Triathlon M · objectif 2h30 », or null when the goal says neither. */
export function raceFormatLine(
  raceFormat: string | null,
  targetPerformance: string | null,
): string | null {
  const parts = [raceFormat?.trim(), objectiveText(targetPerformance)];
  const line = parts.filter(Boolean).join(' · ');
  return line || null;
}

/** « 2:26:48 · objectif sub 2h30 », or null when neither the time nor the target is known. */
export function raceResultLine(
  durationSec: number | null,
  targetPerformance: string | null,
): string | null {
  const parts = [
    durationSec ? formatChronoSeconds(durationSec) : null,
    objectiveText(targetPerformance),
  ];
  return parts.filter(Boolean).join(' · ') || null;
}
