import type { ActivityType, SessionIntensity } from '@prisma/client';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';

/** A planned session a synced activity just counted for. */
export type CountedSession = {
  /** Planned duration, minutes. */
  plannedMin: number | null;
  /** Recorded duration of the linked activity, seconds. */
  doneSec: number | null;
};

/** The next planned session still to do. */
export type NextPlannedSession = {
  type: ActivityType;
  intensity: SessionIntensity | null;
  /** YYYY-MM-DD */
  day: string;
};

const DAY_MS = 24 * 3600 * 1000;

/**
 * « Séance comptée · 92 % du plan » / « Prochaine : Vélo endurance demain ». Computed from the
 * numbers alone — instant, free, never invented. The share is the recorded time against the
 * planned time, the one measure every source and every sport has.
 */
export function sessionDoneAlert(
  counted: readonly CountedSession[],
  next: NextPlannedSession | null,
  today: string,
): { title: string; body: string } {
  const lead = counted.length > 1 ? `${counted.length} séances comptées` : 'Séance comptée';
  const share = planShare(counted);
  return {
    title: share === null ? lead : `${lead} · ${share} % du plan`,
    body: next
      ? `Prochaine : ${nextSessionLabel(next)} ${relativeDay(next.day, today)}`
      : 'Plus rien de prévu dans ton plan pour l’instant.',
  };
}

/** Recorded over planned time, in percent; null when no session had both. */
export function planShare(counted: readonly CountedSession[]): number | null {
  const measured = counted.filter(
    (session) => (session.plannedMin ?? 0) > 0 && (session.doneSec ?? 0) > 0,
  );
  if (measured.length === 0) {
    return null;
  }
  const plannedSec = measured.reduce((sum, session) => sum + (session.plannedMin ?? 0) * 60, 0);
  const doneSec = measured.reduce((sum, session) => sum + (session.doneSec ?? 0), 0);
  return Math.round((doneSec / plannedSec) * 100);
}

/** « Vélo endurance », « Course VO2max » — the sport, then the intensity when planned. */
export function nextSessionLabel(next: Pick<NextPlannedSession, 'type' | 'intensity'>): string {
  const sport = activityTypeLabels[next.type];
  if (!next.intensity) {
    return sport;
  }
  // Lower-cased mid-sentence, except an acronym's capitals (VO2max).
  const intensity = intensityLabels[next.intensity].replace(/^[A-Z](?![A-Z0-9])/, (letter) =>
    letter.toLowerCase(),
  );
  return `${sport} ${intensity}`;
}

/** « aujourd’hui », « demain », « jeudi » within the week, « le 12 oct. » beyond. */
export function relativeDay(day: string, today: string): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  const days = Math.round((date.getTime() - new Date(`${today}T12:00:00.000Z`).getTime()) / DAY_MS);
  if (days <= 0) {
    return 'aujourd’hui';
  }
  if (days === 1) {
    return 'demain';
  }
  if (days < 7) {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(date);
  }
  const short = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
  return `le ${short}`;
}
