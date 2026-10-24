import { addTrainingDays } from '@sharpit/core/training/training-day';

/** The positioning target (week 1–4 adherence), ADR-102. */
export const ADHERENCE_TARGET = 0.7;
export const ADHERENCE_WEEKS = 4;

export type AdherenceSession = {
  /** The planned day, `YYYY-MM-DD`. */
  date: string;
  /** Marked completed, or linked to an activity. */
  done: boolean;
  isKey: boolean;
  brickGroupId: string | null;
};

export type AdherenceRatio = { done: number; planned: number; rate: number | null };

export type AdherenceWeek = {
  /** 1 to 4. */
  week: number;
  /** `closed`: every day is over; `running`: today falls in it; `upcoming`: not started. */
  status: 'closed' | 'running' | 'upcoming';
  all: AdherenceRatio;
  key: AdherenceRatio;
};

export type PlanAdherence = {
  /** The first planned day, where week 1 starts; null when nothing was ever planned. */
  startsOn: string | null;
  weeks: AdherenceWeek[];
};

type Entry = { date: string; done: boolean; isKey: boolean };

/** A brick is one entry, as in Plan: done once two legs (or its only one) are done. */
function entries(sessions: AdherenceSession[]): Entry[] {
  const singles: Entry[] = [];
  const bricks = new Map<string, AdherenceSession[]>();
  for (const session of sessions) {
    if (session.brickGroupId) {
      bricks.set(session.brickGroupId, [...(bricks.get(session.brickGroupId) ?? []), session]);
    } else {
      singles.push(session);
    }
  }
  const brickEntries = [...bricks.values()].map((legs) => ({
    date: legs.map((leg) => leg.date).sort()[0]!,
    done: legs.filter((leg) => leg.done).length >= Math.min(2, legs.length),
    isKey: legs.some((leg) => leg.isKey),
  }));
  return [...singles, ...brickEntries];
}

function ratio(list: Entry[]): AdherenceRatio {
  const done = list.filter((entry) => entry.done).length;
  return { done, planned: list.length, rate: list.length === 0 ? null : done / list.length };
}

/**
 * Week 1–4 adherence from the first planned day: of the sessions on days already over, the
 * share done. Key sessions alone too — a week with none marked counts every session as key.
 */
export function computePlanAdherence(sessions: AdherenceSession[], today: string): PlanAdherence {
  const all = entries(sessions);
  const startsOn = all.map((entry) => entry.date).sort()[0] ?? null;
  if (!startsOn) {
    return { startsOn: null, weeks: [] };
  }

  const weeks = Array.from({ length: ADHERENCE_WEEKS }, (_, index): AdherenceWeek => {
    const weekStart = addTrainingDays(startsOn, index * 7);
    const weekEnd = addTrainingDays(weekStart, 7);
    const inWeek = all.filter((entry) => entry.date >= weekStart && entry.date < weekEnd);
    const over = inWeek.filter((entry) => entry.date < today);
    const marked = over.filter((entry) => entry.isKey);
    const status = today >= weekEnd ? 'closed' : today >= weekStart ? 'running' : 'upcoming';
    return {
      week: index + 1,
      status,
      all: ratio(over),
      key: ratio(inWeek.some((entry) => entry.isKey) ? marked : over),
    };
  });
  return { startsOn, weeks };
}

/** The window to read: the first planned day and the 28 days after it. */
export function adherenceWindowEnd(startsOn: string): string {
  return addTrainingDays(startsOn, ADHERENCE_WEEKS * 7);
}

export type CohortAdherence = {
  /** Mean rate per week over the athletes whose week is closed; null when none is. */
  meanByWeek: (number | null)[];
  /** Athletes whose week 4 is closed, and how many of them reached the target. */
  weekFourClosed: number;
  weekFourOnTarget: number;
};

/** The cohort line above the list: closed weeks only, so a week still running never drags it. */
export function summarizeCohort(adherences: PlanAdherence[]): CohortAdherence {
  const closedRates = (index: number) =>
    adherences.flatMap(({ weeks }) => {
      const week = weeks[index];
      return week?.status === 'closed' && week.all.rate !== null ? [week.all.rate] : [];
    });
  const meanByWeek = Array.from({ length: ADHERENCE_WEEKS }, (_, index) => {
    const rates = closedRates(index);
    return rates.length === 0 ? null : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  });
  const weekFour = closedRates(ADHERENCE_WEEKS - 1);
  return {
    meanByWeek,
    weekFourClosed: weekFour.length,
    weekFourOnTarget: weekFour.filter((rate) => rate >= ADHERENCE_TARGET).length,
  };
}
