/**
 * Race priority semantics (ADR-084): what A / B / C mean for the plan, the default a new race
 * should get, and the A races that compete for the same season.
 */
import type { GoalPriority } from '@prisma/client';
import { addMonths } from 'date-fns';
import {
  raceTargetBounds,
  resolveStructuredRace,
  type RaceDiscipline,
  type StructuredRace,
} from '@sharpit/app/lib/goals/race-formats';

export const PRIORITY_ROLES: Record<GoalPriority, string> = {
  A: 'Objectif principal',
  B: 'Course étape',
  C: "Course d'entraînement",
};

export const PRIORITY_CONSEQUENCES: Record<GoalPriority, string> = {
  A: 'Le plan entier est construit vers cette course, avec un affûtage complet.',
  B: 'Mini-affûtage les 5 jours avant et 3 jours de récupération après, sans casser le plan.',
  C: "Pas d'affûtage : la course compte comme une séance dure de la semaine.",
};

/** Two A races closer than this compete for the same peak. */
export const A_RACE_MIN_GAP_MONTHS = 6;
/** A race this close before an A belongs to its season (and to its plan). */
export const A_RACE_SEASON_MONTHS = 12;
/** A step race under this share of the A's effort is a tune-up (C), not a step (B). */
export const TUNE_UP_EFFORT_RATIO = 0.25;

export type PrioritizedRace = {
  id: string;
  title: string;
  date: Date;
  priority: GoalPriority | null;
  /** Expected effort; null when the race is not structured. */
  effortSec: number | null;
};

type GoalRaceFields = Omit<StructuredRace, 'discipline' | 'formatKey'> & {
  id: string;
  title: string;
  kind: string;
  achieved: boolean;
  targetDate: Date | string | null;
  priority: GoalPriority | null;
  discipline: string | null;
  formatKey: string | null;
};

/** Expected race duration: the middle of the format's realistic finish bounds. */
export function raceEffortSeconds(goal: GoalRaceFields): number | null {
  if (!goal.discipline || !goal.formatKey) {
    return null;
  }
  const race = resolveStructuredRace({
    ...goal,
    discipline: goal.discipline as RaceDiscipline,
    formatKey: goal.formatKey,
  });
  if (!race) {
    return null;
  }
  const { minSec, maxSec } = raceTargetBounds(race);
  return maxSec > 0 ? Math.round((minSec + maxSec) / 2) : null;
}

/** Active, dated race goals as the priority rules see them. */
export function toPrioritizedRaces(goals: GoalRaceFields[]): PrioritizedRace[] {
  return goals
    .filter((g) => g.kind === 'RACE' && !g.achieved && g.targetDate)
    .map((g) => ({
      id: g.id,
      title: g.title,
      date: new Date(g.targetDate!),
      priority: g.priority,
      effortSec: raceEffortSeconds(g),
    }));
}

function withinMonths(a: Date, b: Date, months: number): boolean {
  const [early, late] = a <= b ? [a, b] : [b, a];
  return late < addMonths(early, months);
}

function isLonger(a: PrioritizedRace, b: PrioritizedRace): boolean {
  if ((a.effortSec ?? 0) !== (b.effortSec ?? 0)) {
    return (a.effortSec ?? 0) > (b.effortSec ?? 0);
  }
  return a.date > b.date;
}

function stepPriority(race: PrioritizedRace, target: PrioritizedRace): GoalPriority {
  if (!isLonger(target, race)) {
    return 'A';
  }
  const isTuneUp =
    race.effortSec !== null &&
    target.effortSec !== null &&
    race.effortSec < target.effortSec * TUNE_UP_EFFORT_RATIO;
  return isTuneUp ? 'C' : 'B';
}

/**
 * Default priority for a new race: with no A in its season the longest (then farthest) race is
 * the A; any other race is a step (B), or a tune-up (C) when far shorter than the season target.
 */
export function suggestPriority(
  newRace: PrioritizedRace,
  existingRaces: PrioritizedRace[],
): GoalPriority {
  const season = existingRaces.filter(
    (r) => r.id !== newRace.id && withinMonths(r.date, newRace.date, A_RACE_SEASON_MONTHS),
  );
  const seasonA = season.find((r) => r.priority === 'A');
  const target =
    seasonA ?? season.reduce<PrioritizedRace>((best, r) => (isLonger(r, best) ? r : best), newRace);
  return target === newRace ? 'A' : stepPriority(newRace, target);
}

export type SeasonConflict = [PrioritizedRace, PrioritizedRace];

/** Pairs of A races less than six months apart — two peaks the plan cannot both honour. */
export function seasonConflicts(races: PrioritizedRace[]): SeasonConflict[] {
  const aRaces = races
    .filter((r) => r.priority === 'A')
    .sort((x, y) => x.date.getTime() - y.date.getTime());
  return aRaces.flatMap((race, i) =>
    aRaces
      .slice(i + 1)
      .filter((other) => withinMonths(race.date, other.date, A_RACE_MIN_GAP_MONTHS))
      .map((other): SeasonConflict => [race, other]),
  );
}

export type GoalPriorityFields = {
  priorityRole: string | null;
  priorityConsequence: string | null;
  seasonConflict: { otherGoalId: string; otherTitle: string } | null;
  /** Default for a race with no priority yet; null otherwise. */
  suggestedPriority: GoalPriority | null;
};

/** Contract additions on a goal payload, given the athlete's other goals. */
export function goalPriorityFields(
  goal: GoalRaceFields,
  allGoals: GoalRaceFields[],
): GoalPriorityFields {
  const races = toPrioritizedRaces(
    allGoals.some((g) => g.id === goal.id) ? allGoals : [...allGoals, goal],
  );
  const self = races.find((r) => r.id === goal.id);
  const conflict = seasonConflicts(races).find(([x, y]) => x.id === goal.id || y.id === goal.id);
  const other = conflict?.find((r) => r.id !== goal.id);
  return {
    priorityRole: goal.priority ? PRIORITY_ROLES[goal.priority] : null,
    priorityConsequence: goal.priority ? PRIORITY_CONSEQUENCES[goal.priority] : null,
    seasonConflict: other ? { otherGoalId: other.id, otherTitle: other.title } : null,
    suggestedPriority: self && !goal.priority ? suggestPriority(self, races) : null,
  };
}

/** The set priority, else the suggested one. */
export function effectivePriority(race: PrioritizedRace, races: PrioritizedRace[]): GoalPriority {
  return race.priority ?? suggestPriority(race, races);
}

/**
 * The race a plan builds toward: for a B or C race, the A race it steps up to (the nearest A
 * after it, within its season); otherwise the race itself.
 */
export function planTargetRace(
  requested: PrioritizedRace,
  races: PrioritizedRace[],
): PrioritizedRace {
  if (effectivePriority(requested, races) === 'A') {
    return requested;
  }
  const [nextA] = races
    .filter(
      (r) =>
        r.priority === 'A' &&
        r.date > requested.date &&
        withinMonths(r.date, requested.date, A_RACE_SEASON_MONTHS),
    )
    .sort((x, y) => x.date.getTime() - y.date.getTime());
  return nextA ?? requested;
}

/** B and C races from `from` up to the plan's target — the plan's step races. */
export function planStepRaces(
  target: PrioritizedRace,
  races: PrioritizedRace[],
  from: Date,
): { title: string; date: Date; priority: 'B' | 'C' }[] {
  return races.flatMap((race) => {
    const priority = effectivePriority(race, races);
    const inHorizon = race.id !== target.id && race.date >= from && race.date < target.date;
    return inHorizon && priority !== 'A' ? [{ title: race.title, date: race.date, priority }] : [];
  });
}
