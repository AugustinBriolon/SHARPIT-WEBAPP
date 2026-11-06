import { addDays } from 'date-fns';
import type { ActivityType, PrismaClient, SessionIntensity } from '@prisma/client';
import type { MovementIntent } from '@sharpit/app/lib/exercises/movement-taxonomy';
import { HARD_SESSION_INTENSITIES } from '@sharpit/app/lib/plan/trajectory/intensity-gate';
import { toUtcDateOnly } from '@sharpit/app/lib/travel-context/calendar-date';
import { travelRangesOverlap } from '@sharpit/app/lib/travel-context/overlap';
import { normalizeTravelDisciplines } from '@sharpit/app/lib/travel-context/disciplines';
import { isTravelTrainingConstraint } from '@sharpit/app/lib/travel-context/training-constraint';
import { parseStrengthPrescription } from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import { strengthIntentsOf } from '@sharpit/server/lib/coach/chat/tools/coach-tools-travel-guard';
import {
  findTravelSessionViolation,
  type TrainingRestriction,
} from '@sharpit/server/lib/travel-context/session-compatibility';

/** The days ahead a conflict is read over: the plan adapter's own default horizon. */
export const TRAVEL_CONFLICT_HORIZON_DAYS = 14;

export type ConflictWindow = TrainingRestriction & {
  id: string;
  type: 'TRAVEL' | 'CONSTRAINT';
};

export type ConflictSession = {
  date: Date;
  type: ActivityType;
  intensity: SessionIntensity | null;
  isKey: boolean;
  strengthIntents?: ReadonlyArray<MovementIntent | null>;
};

/** Résumé's « Ton déplacement bouscule ton plan »: the first window over sessions that do not fit. */
export type TravelConflictView = {
  travelId: string;
  type: 'TRAVEL' | 'CONSTRAINT';
  name: string;
  startDate: string;
  endDate: string;
  trainingConstraint: TrainingRestriction['trainingConstraint'];
  sessionCount: number;
} | null;

const HARD = new Set<string>(HARD_SESSION_INTENSITIES);

/**
 * A session does not fit a window when the window forbids it (a pause, a sport off the list:
 * the rule the plan's writes already obey), or when the window lightens training and the
 * session is a key or a hard one — what « Allégé » asks the coach to take out.
 */
export function sessionConflicts(window: TrainingRestriction, session: ConflictSession): boolean {
  if (findTravelSessionViolation([window], session) !== null) {
    return true;
  }
  if (window.trainingConstraint !== 'REDUCED' || !overlapsDay(window, session.date)) {
    return false;
  }
  return session.isKey || (session.intensity !== null && HARD.has(session.intensity));
}

/** The earliest window with at least one session to do that does not fit it. Pure. */
export function findTravelConflict(
  windows: readonly ConflictWindow[],
  sessions: readonly ConflictSession[],
): TravelConflictView {
  const ordered = [...windows].sort((a, b) => dayOf(a.startDate).localeCompare(dayOf(b.startDate)));
  for (const window of ordered) {
    const sessionCount = sessions.filter((session) => sessionConflicts(window, session)).length;
    if (sessionCount > 0) {
      return {
        travelId: window.id,
        type: window.type,
        name: window.label?.trim() || window.locationLabel?.trim() || '',
        startDate: dayOf(window.startDate),
        endDate: dayOf(window.endDate),
        trainingConstraint: window.trainingConstraint,
        sessionCount,
      };
    }
  }
  return null;
}

/** Reads the athlete's trips, constraints and sessions to do over the horizon from `today`. */
export async function readTravelConflictView(
  prisma: PrismaClient,
  athleteId: string,
  today: string,
): Promise<TravelConflictView> {
  const start = toUtcDateOnly(new Date(today));
  const end = addDays(start, TRAVEL_CONFLICT_HORIZON_DAYS - 1);
  const rows = await prisma.athleteTravelContext.findMany({
    where: {
      athleteId,
      type: { in: ['TRAVEL', 'CONSTRAINT'] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (rows.length === 0) {
    return null;
  }
  const sessions = await prisma.plannedSession.findMany({
    where: { athleteId, completed: false, date: { gte: start, lte: end } },
    select: { date: true, type: true, intensity: true, isKey: true, strengthPrescription: true },
  });
  const windows: ConflictWindow[] = rows.map((row) => ({
    id: row.id,
    type: row.type as ConflictWindow['type'],
    label: row.label,
    locationLabel: row.locationLabel,
    startDate: row.startDate,
    endDate: row.endDate,
    trainingConstraint: isTravelTrainingConstraint(row.trainingConstraint)
      ? row.trainingConstraint
      : 'FULL',
    allowedDisciplines: normalizeTravelDisciplines(row.allowedDisciplines),
  }));
  return findTravelConflict(
    windows,
    sessions.map((session) => ({
      date: session.date,
      type: session.type,
      intensity: session.intensity,
      isKey: session.isKey,
      strengthIntents: strengthIntentsOf(parseStrengthPrescription(session.strengthPrescription)),
    })),
  );
}

function overlapsDay(window: TrainingRestriction, day: Date): boolean {
  return travelRangesOverlap(window, { startDate: day, endDate: day });
}

function dayOf(value: Date | string): string {
  return (typeof value === 'string' ? new Date(value) : value).toISOString().slice(0, 10);
}
