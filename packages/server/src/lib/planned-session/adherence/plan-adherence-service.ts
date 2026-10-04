import { addTrainingDays } from '@sharpit/core/training/training-day';
import { prisma } from '@sharpit/db/client';
import {
  ADHERENCE_TARGET,
  mondayOf,
  OUTCOME_WINDOW_DAYS,
  outcomeAdherence,
  weekProgress,
  type AdherenceSession,
  type OutcomeAdherence,
} from '@sharpit/app/lib/plan/plan-adherence';
import { DEMO_CLERK_USER_ID } from '@sharpit/app/lib/demo/demo-session';

export type OutcomeRow = OutcomeAdherence & { athleteId: string };

export type OutcomeReport = {
  target: number;
  rows: OutcomeRow[];
  /** Athletes whose four weeks are over, with something planned in them. */
  finished: number;
  /** Of those, the ones at or above the target. */
  meetingTarget: number;
  /** meetingTarget / finished; null before anyone finished. */
  share: number | null;
};

const sessionFields = { date: true, completed: true, brickGroupId: true } as const;

function toAdherenceSession(session: {
  date: Date;
  completed: boolean;
  brickGroupId: string | null;
}): AdherenceSession {
  return {
    day: dayOf(session.date),
    completed: session.completed,
    brickGroupId: session.brickGroupId,
  };
}

/** This week's sessions done out of planned — « 3 sur 5 cette semaine ». */
export async function loadWeekProgress(athleteId: string, today: string) {
  const monday = mondayOf(today);
  const sessions = await prisma.plannedSession.findMany({
    where: {
      athleteId,
      date: {
        gte: new Date(`${monday}T00:00:00.000Z`),
        lt: new Date(`${addTrainingDays(monday, 7)}T00:00:00.000Z`),
      },
    },
    select: sessionFields,
  });
  return weekProgress(sessions.map(toAdherenceSession), today);
}

/**
 * The outcome, athlete by athlete: the share of planned sessions done over their first four
 * weeks, from the end of the onboarding (else their first planned session). Real athletes only:
 * the demo account and deleted accounts are left out.
 */
export async function loadOutcomeReport(today: string): Promise<OutcomeReport> {
  const athletes = await prisma.athleteProfile.findMany({
    where: { deletedAt: null, clerkUserId: { not: DEMO_CLERK_USER_ID } },
    select: { id: true, onboardingCompletedAt: true },
  });
  const rows: OutcomeRow[] = [];
  for (const athlete of athletes) {
    const row = await athleteOutcome(athlete, today);
    if (row) {
      rows.push(row);
    }
  }
  const finished = rows.filter((row) => row.complete && row.meetsTarget !== null);
  const meetingTarget = finished.filter((row) => row.meetsTarget).length;
  return {
    target: ADHERENCE_TARGET,
    rows,
    finished: finished.length,
    meetingTarget,
    share: finished.length === 0 ? null : meetingTarget / finished.length,
  };
}

async function athleteOutcome(
  athlete: { id: string; onboardingCompletedAt: Date | null },
  today: string,
): Promise<OutcomeRow | null> {
  const start = athlete.onboardingCompletedAt
    ? dayOf(athlete.onboardingCompletedAt)
    : await firstPlannedDay(athlete.id);
  if (!start) {
    return null;
  }
  const sessions = await prisma.plannedSession.findMany({
    where: {
      athleteId: athlete.id,
      date: {
        gte: new Date(`${start}T00:00:00.000Z`),
        lt: new Date(`${addTrainingDays(start, OUTCOME_WINDOW_DAYS)}T00:00:00.000Z`),
      },
    },
    select: sessionFields,
  });
  return {
    athleteId: athlete.id,
    ...outcomeAdherence(sessions.map(toAdherenceSession), start, today),
  };
}

async function firstPlannedDay(athleteId: string): Promise<string | null> {
  const first = await prisma.plannedSession.findFirst({
    where: { athleteId },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  return first ? dayOf(first.date) : null;
}

/** A `@db.Date` column, or a timestamp, as its UTC day. */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
