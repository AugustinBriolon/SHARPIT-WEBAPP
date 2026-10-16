import { z } from 'zod';
import { addTrainingDays, trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { resolveAthleteTrainingDayTimeZone } from '@sharpit/server/lib/journal/wellness-checkin';

export const TRAINING_DAY_ID_SCHEMA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_TRAINING_DAY_FORMAT');

export type TrainingDayWindowCode = 'INVALID_TRAINING_DAY_FORMAT' | 'TRAINING_DAY_OUT_OF_RANGE';

export type TrainingDayWindowResult =
  { ok: true; trainingDayId: string } | { ok: false; code: TrainingDayWindowCode };

/**
 * Accepts today or yesterday in the athlete's training-day timezone.
 * Athlete identity must come from the session — never from the client body.
 */
export async function resolveAllowedTrainingDayId(
  athleteId: string,
  candidate: string | null | undefined,
  now: Date = new Date(),
): Promise<TrainingDayWindowResult> {
  const timezone = await resolveAthleteTrainingDayTimeZone(athleteId);
  const today = trainingDayIdForNow({ timezone }, now);
  const yesterday = addTrainingDays(today, -1);

  if (candidate === null || candidate === undefined || candidate === '') {
    return { ok: true, trainingDayId: today };
  }

  const parsed = TRAINING_DAY_ID_SCHEMA.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_TRAINING_DAY_FORMAT' };
  }

  if (parsed.data !== today && parsed.data !== yesterday) {
    return { ok: false, code: 'TRAINING_DAY_OUT_OF_RANGE' };
  }

  return { ok: true, trainingDayId: parsed.data };
}
