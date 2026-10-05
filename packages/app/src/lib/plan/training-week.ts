import { addTrainingDays } from '@sharpit/core/training/training-day';

/** The Monday of the week holding `day`, YYYY-MM-DD — a plan's week runs Monday to Sunday. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T12:00:00.000Z`).getUTCDay();
  return addTrainingDays(day, -((weekday + 6) % 7));
}
