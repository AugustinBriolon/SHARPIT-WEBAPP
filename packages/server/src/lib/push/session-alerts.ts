import type { ActivityType, SessionIntensity } from '@prisma/client';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';

/**
 * The words of the pushes about planned sessions — done (E1) and missed (F1). Computed from the
 * numbers alone: instant, free, never invented. The voice is a coach's who knows the athlete —
 * warm and plain, never a cheerleader's.
 */

/** A planned session a synced activity just counted for. */
export type CountedSession = {
  /** Planned duration, minutes. */
  plannedMin: number | null;
  /** Recorded duration of the linked activity, seconds. */
  doneSec: number | null;
};

/** What a session is, enough to name it. */
export type SessionKind = {
  type: ActivityType;
  intensity: SessionIntensity | null;
};

/** The next planned session still to do. */
export type NextPlannedSession = SessionKind & {
  /** YYYY-MM-DD */
  day: string;
};

/** A session of yesterday that no activity counted for. */
export type MissedSession = SessionKind & {
  brickGroupId: string | null;
};

const DAY_MS = 24 * 3600 * 1000;

/** How far from the planned time the share is worth a word. */
const SHORT_OF_PLAN = 80;
const BEYOND_PLAN = 120;

/** The sport with its possessive, as said aloud: « ton vélo », « ta course ». */
const SPORT_WITH_POSSESSIVE: Record<ActivityType, string> = {
  RUN: 'ta course',
  BIKE: 'ton vélo',
  SWIM: 'ta natation',
  STRENGTH: 'ta séance de muscu',
  TRIATHLON: 'ton triathlon',
  HIKE: 'ta rando',
  OTHER: 'ta séance',
};

const SPORT_NAME: Record<ActivityType, string> = {
  RUN: 'course',
  BIKE: 'vélo',
  SWIM: 'natation',
  STRENGTH: 'muscu',
  TRIATHLON: 'triathlon',
  HIKE: 'rando',
  OTHER: 'séance',
};

/**
 * « Séance dans la boîte · 92 % du plan » / « On se retrouve demain pour ton vélo endurance. »
 * The share is the recorded time against the planned time, the one measure every source and every
 * sport has; a word is added only when it sits well short of the plan or well beyond it.
 */
export function sessionDoneAlert(
  counted: readonly CountedSession[],
  next: NextPlannedSession | null,
  today: string,
): { title: string; body: string } {
  const lead =
    counted.length > 1 ? `${counted.length} séances dans la boîte` : 'Séance dans la boîte';
  const share = planShare(counted);
  return {
    title: share === null ? lead : `${lead} · ${share} % du plan`,
    body: [shareRemark(share), nextSessionLine(next, today)].filter(Boolean).join(' '),
  };
}

/** « Dommage pour hier » / « Ta course seuil n’a pas eu lieu. On réorganise ta semaine ensemble ? » */
export function missedSessionAlert(missed: readonly MissedSession[]): {
  title: string;
  body: string;
} {
  return {
    title: 'Dommage pour hier',
    body: `${capitalize(missedSubject(missed))}. On réorganise ta semaine ensemble ?`,
  };
}

/** What the coach is asked when the athlete taps through, as « Rattraper ma semaine » names it. */
export function missedSessionLabel(missed: readonly MissedSession[]): string {
  if (isOneBrick(missed)) {
    return `Brick ${missed.map((leg) => SPORT_NAME[leg.type]).join(' → ')}`;
  }
  return capitalize(`${SPORT_NAME[missed[0].type]}${intensitySuffix(missed[0])}`);
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

/** « ton vélo endurance », « ta course VO2max » — the sport, then the intensity when planned. */
export function sessionName(session: SessionKind): string {
  return `${SPORT_WITH_POSSESSIVE[session.type]}${intensitySuffix(session)}`;
}

/** « seuil », « VO2max » after the sport; nothing for strength, whose intensity is not said. */
function intensitySuffix(session: SessionKind): string {
  if (!session.intensity || session.type === 'STRENGTH') {
    return '';
  }
  // Lower-cased mid-sentence, except an acronym's capitals (VO2max).
  const intensity = intensityLabels[session.intensity].replace(/^[A-Z](?![A-Z0-9])/, (letter) =>
    letter.toLowerCase(),
  );
  return ` ${intensity}`;
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

function shareRemark(share: number | null): string | null {
  if (share === null) {
    return null;
  }
  if (share < SHORT_OF_PLAN) {
    return 'Pas tout le plan, mais c’est fait — c’est ce qui compte.';
  }
  return share > BEYOND_PLAN ? 'Plus que prévu : pense à bien récupérer.' : null;
}

function nextSessionLine(next: NextPlannedSession | null, today: string): string {
  if (!next) {
    return 'Rien d’autre de prévu pour l’instant : profite.';
  }
  const day = relativeDay(next.day, today);
  const when = day === 'aujourd’hui' ? 'plus tard' : day;
  return `On se retrouve ${when} pour ${sessionName(next)}.`;
}

function missedSubject(missed: readonly MissedSession[]): string {
  if (isOneBrick(missed)) {
    return `ton enchaînement ${missed.map((leg) => SPORT_NAME[leg.type]).join(' → ')} n’a pas eu lieu`;
  }
  if (missed.length > 1) {
    return `tes ${missed.length} séances n’ont pas eu lieu`;
  }
  return `${sessionName(missed[0])} n’a pas eu lieu`;
}

function isOneBrick(missed: readonly MissedSession[]): boolean {
  const [first] = missed;
  return (
    missed.length > 1 &&
    !!first?.brickGroupId &&
    missed.every((leg) => leg.brickGroupId === first.brickGroupId)
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
