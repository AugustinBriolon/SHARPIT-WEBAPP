import type { ActivityType, SessionIntensity } from '@prisma/client';
import { mondayOf } from '@sharpit/app/lib/plan/training-week';

/**
 * The week's key sessions: the two or three that carry the preparation — a race, the hard
 * sessions, the long endurance outing, a brick. The rest is welcome but optional, so missing it
 * is not a missed week (F2, positioning 2026-10-02). A rule rather than the model's word:
 * predictable, free, and the athlete changes it with one tap.
 */

export type KeySessionCandidate = {
  /** YYYY-MM-DD */
  date: string;
  type: ActivityType;
  intensity: SessionIntensity | null;
  durationMin: number | null;
  brickGroupId?: string | null;
};

export const MAX_KEY_SESSIONS_PER_WEEK = 3;

const ENDURANCE_SPORTS: readonly ActivityType[] = ['RUN', 'BIKE', 'SWIM', 'TRIATHLON'];
/** Shorter than this, an endurance outing is not « the long one ». */
const LONG_OUTING_MIN = 60;

const INTENSITY_WEIGHT: Partial<Record<SessionIntensity, number>> = {
  RACE: 100,
  VO2MAX: 50,
  THRESHOLD: 50,
  TEMPO: 30,
};
const BRICK_WEIGHT = 60;
const LONG_OUTING_WEIGHT = 55;

/** Indices of the key sessions, at most three per Monday-to-Sunday week. */
export function chooseKeySessions(sessions: readonly KeySessionCandidate[]): Set<number> {
  const weeks = new Map<string, number[]>();
  sessions.forEach((session, index) => {
    const week = mondayOf(session.date);
    weeks.set(week, [...(weeks.get(week) ?? []), index]);
  });
  const keys = new Set<number>();
  for (const indices of weeks.values()) {
    for (const index of keysOfWeek(sessions, indices)) {
      keys.add(index);
    }
  }
  return keys;
}

function keysOfWeek(sessions: readonly KeySessionCandidate[], indices: number[]): number[] {
  const longOuting = longestEnduranceOuting(sessions, indices);
  const weight = (index: number) => {
    const session = sessions[index];
    const byIntensity = session.intensity ? (INTENSITY_WEIGHT[session.intensity] ?? 0) : 0;
    const byBrick = session.brickGroupId ? BRICK_WEIGHT : 0;
    const byLength = index === longOuting ? LONG_OUTING_WEIGHT : 0;
    return Math.max(byIntensity, byBrick, byLength);
  };
  const ranked = indices
    .filter((index) => weight(index) > 0)
    .sort(
      (a, b) =>
        weight(b) - weight(a) || (sessions[b].durationMin ?? 0) - (sessions[a].durationMin ?? 0),
    );
  // A brick is one session to the athlete: its legs take one place, and go in together.
  const picked: number[] = [];
  const bricks = new Set<string>();
  for (const index of ranked) {
    const brick = sessions[index].brickGroupId;
    if (brick && bricks.has(brick)) {
      continue;
    }
    if (picked.length - legsBeyondFirst(sessions, picked) >= MAX_KEY_SESSIONS_PER_WEEK) {
      break;
    }
    if (brick) {
      bricks.add(brick);
      picked.push(...indices.filter((leg) => sessions[leg].brickGroupId === brick));
    } else {
      picked.push(index);
    }
  }
  return picked;
}

/** How many picked indices are a brick's second leg or later — they take no place. */
function legsBeyondFirst(sessions: readonly KeySessionCandidate[], picked: number[]): number {
  const seen = new Set<string>();
  let extra = 0;
  for (const index of picked) {
    const brick = sessions[index].brickGroupId;
    if (!brick) {
      continue;
    }
    if (seen.has(brick)) {
      extra += 1;
    }
    seen.add(brick);
  }
  return extra;
}

/** The week's longest easy endurance session, when it is long enough to be the long one. */
function longestEnduranceOuting(
  sessions: readonly KeySessionCandidate[],
  indices: number[],
): number | null {
  let longest: number | null = null;
  for (const index of indices) {
    const session = sessions[index];
    const easy = session.intensity === 'ENDURANCE' || session.intensity === null;
    if (!easy || !ENDURANCE_SPORTS.includes(session.type)) {
      continue;
    }
    if ((session.durationMin ?? 0) < LONG_OUTING_MIN) {
      continue;
    }
    if (longest === null || (session.durationMin ?? 0) > (sessions[longest].durationMin ?? 0)) {
      longest = index;
    }
  }
  return longest;
}

/**
 * Whether a session counts as key: marked so, or in a week where nothing is marked — every
 * session of a plan made before key sessions existed keeps counting.
 */
export function countsAsKey(session: { isKey: boolean }, weekHasKeys: boolean): boolean {
  return session.isKey || !weekHasKeys;
}
