import { differenceInCalendarDays, parseISO } from 'date-fns';
import { prisma } from '@sharpit/db/client';
import { isNonSessionSubjective } from '@sharpit/server/lib/journal/wellness-checkin';
import {
  getActivityDatesInRange,
  getHealthEntries,
  getNutritionCaloriesInRange,
} from '@sharpit/server/lib/queries';
import {
  collectDataDays,
  dataDaysSourcesFor,
  type DataDaysRequest,
} from '@sharpit/app/lib/presentation/data-days/data-days';

/** Days in `[from, to]` that carry data for the requested drill-down domain. */
export async function loadDataDays(
  athleteId: string,
  { domain, from, to }: DataDaysRequest,
): Promise<string[]> {
  const needs = dataDaysSourcesFor(domain);
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const spanDays = differenceInCalendarDays(toDate, fromDate) + 1;

  const [health, activityDates, nutrition, journal, checkins] = await Promise.all([
    // getHealthEntries applies the athlete's wearable source preference.
    needs.health ? getHealthEntries(athleteId, spanDays, toDate) : [],
    needs.activities ? getActivityDatesInRange(athleteId, fromDate, toDate) : [],
    needs.nutrition ? getNutritionCaloriesInRange(athleteId, from, to) : [],
    needs.journal
      ? prisma.athleteDayJournal.findMany({
          where: { athleteId, trainingDayId: { gte: from, lte: to } },
          select: {
            trainingDayId: true,
            factors: true,
            moodLabel: true,
            hydrationMl: true,
            caffeineMg: true,
            drivingMinutes: true,
          },
        })
      : [],
    needs.journal
      ? prisma.observation.findMany({
          where: {
            athleteId,
            type: 'SUBJECTIVE',
            source: 'MANUAL',
            trainingDayId: { gte: from, lte: to },
          },
          select: { trainingDayId: true, data: true },
        })
      : [],
  ]);

  const checkinDays = checkins
    .filter((row) => row.trainingDayId && isNonSessionSubjective(row.data))
    .map((row) => row.trainingDayId as string);

  return collectDataDays(
    domain,
    { health, activityDates, nutrition, journal, checkinDays },
    { from, to },
  );
}
