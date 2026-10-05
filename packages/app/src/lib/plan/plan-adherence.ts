import { addTrainingDays } from '@sharpit/core/training/training-day';
import { countsAsKey } from '@sharpit/app/lib/planned-session/key-sessions';
import { mondayOf } from '@sharpit/app/lib/plan/training-week';

/**
 * How much of the plan the athlete follows — the product's outcome (« ≥ 70 % of planned sessions
 * done over the first four weeks », positioning 2026-10-02). Pure: the server loads the sessions,
 * this counts them.
 */

/** A planned session, enough to count it. */
export type AdherenceSession = {
  /** YYYY-MM-DD */
  day: string;
  completed: boolean;
  brickGroupId: string | null;
  /** One of the week's key sessions (F2); absent on sessions read before the flag existed. */
  isKey?: boolean;
};

export type Adherence = {
  planned: number;
  done: number;
  /** done / planned, 0–1; null with nothing planned yet. */
  rate: number | null;
};

export type OutcomeAdherence = Adherence & {
  /** The same count over the key sessions only — whether the preparation itself holds. */
  key: Adherence;
  /** First day of the window, YYYY-MM-DD. */
  start: string;
  /** The four weeks are over: the rate is final. */
  complete: boolean;
  /** The rate reaches the target; null until something was planned. */
  meetsTarget: boolean | null;
};

export const ADHERENCE_TARGET = 0.7;
export const OUTCOME_WINDOW_DAYS = 28;

/**
 * Sessions as the athlete sees them: a brick's legs are one session, done once every leg is.
 * A brick is dated by its first leg.
 */
export function planUnits(sessions: readonly AdherenceSession[]): AdherenceSession[] {
  const bricks = new Map<string, AdherenceSession>();
  const units: AdherenceSession[] = [];
  for (const session of sessions) {
    if (!session.brickGroupId) {
      units.push(session);
      continue;
    }
    const brick = bricks.get(session.brickGroupId);
    if (!brick) {
      const unit = { ...session };
      bricks.set(session.brickGroupId, unit);
      units.push(unit);
      continue;
    }
    brick.completed = brick.completed && session.completed;
    brick.isKey = brick.isKey || session.isKey;
    brick.day = session.day < brick.day ? session.day : brick.day;
  }
  return units;
}

/**
 * Sessions of [from, to) that are due: every past one, and today's once done — a session later
 * today is not missed yet.
 */
export function adherence(
  sessions: readonly AdherenceSession[],
  window: { from: string; to: string },
  today: string,
  options: { keysOnly?: boolean } = {},
): Adherence {
  const units = options.keysOnly ? keyUnits(planUnits(sessions)) : planUnits(sessions);
  const due = units.filter(
    (unit) =>
      unit.day >= window.from &&
      unit.day < window.to &&
      (unit.day < today || (unit.day === today && unit.completed)),
  );
  const done = due.filter((unit) => unit.completed).length;
  return { planned: due.length, done, rate: due.length === 0 ? null : done / due.length };
}

/** The athlete's first four weeks from `start`, as far as they have gone. */
export function outcomeAdherence(
  sessions: readonly AdherenceSession[],
  start: string,
  today: string,
): OutcomeAdherence {
  const to = addTrainingDays(start, OUTCOME_WINDOW_DAYS);
  const counted = adherence(sessions, { from: start, to }, today);
  return {
    ...counted,
    key: adherence(sessions, { from: start, to }, today, { keysOnly: true }),
    start,
    complete: today >= to,
    meetsTarget: counted.rate === null ? null : counted.rate >= ADHERENCE_TARGET,
  };
}

/** The key sessions, week by week — every session of a week where none is marked. */
function keyUnits(units: readonly AdherenceSession[]): AdherenceSession[] {
  const weeksWithKeys = new Set(
    units.filter((unit) => unit.isKey).map((unit) => mondayOf(unit.day)),
  );
  return units.filter((unit) =>
    countsAsKey({ isKey: Boolean(unit.isKey) }, weeksWithKeys.has(mondayOf(unit.day))),
  );
}

/** This week, Monday to Sunday: sessions done out of all planned, the ones still ahead included. */
export function weekProgress(
  sessions: readonly AdherenceSession[],
  today: string,
): { done: number; planned: number } {
  const monday = mondayOf(today);
  const nextMonday = addTrainingDays(monday, 7);
  const week = planUnits(sessions).filter((unit) => unit.day >= monday && unit.day < nextMonday);
  return { done: week.filter((unit) => unit.completed).length, planned: week.length };
}
