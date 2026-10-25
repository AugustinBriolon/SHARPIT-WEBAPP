import { Decoder, Stream } from '@garmin/fitsdk';
import { ACTIVITY_FEELING_SCALE } from '@sharpit/app/lib/activity/feeling/activity-feeling-scale';

/** What the athlete answered on the watch when the activity ended. */
export type GarminSelfEvaluation = { rpe: number | null; feeling: string | null };

const NONE: GarminSelfEvaluation = { rpe: null, feeling: null };

/** The watch keeps the feel on 0-100 in five steps (very weak … very strong), 25 apart. */
const FEEL_STEP = 25;

/**
 * The FIT session's `workout_rpe` is Borg CR10 times ten and `workout_feel` a 0-100 scale
 * (SDK profile, message 18); SharpIt's RPE is 1-10 and its feeling the five words of
 * `ACTIVITY_FEELING_SCALE`, worst first.
 */
export function selfEvaluationFromSession(session: {
  workoutRpe?: number;
  workoutFeel?: number;
}): GarminSelfEvaluation {
  const { workoutRpe, workoutFeel } = session;
  const rpe =
    typeof workoutRpe === 'number' && workoutRpe > 0
      ? Math.min(10, Math.max(1, Math.round(workoutRpe / 10)))
      : null;
  const step =
    typeof workoutFeel === 'number'
      ? Math.min(ACTIVITY_FEELING_SCALE.length - 1, Math.round(workoutFeel / FEEL_STEP))
      : null;
  return { rpe, feeling: step === null ? null : ACTIVITY_FEELING_SCALE[step].value };
}

/** Reads the answers out of an activity's FIT file; none when the file holds none or is unreadable. */
export function readSelfEvaluation(fit: Uint8Array): GarminSelfEvaluation {
  const decoder = new Decoder(Stream.fromBuffer(fit));
  if (!decoder.isFIT()) {
    return NONE;
  }
  const { messages } = decoder.read();
  const session = messages.sessionMesgs?.find(
    (mesg) => mesg.workoutRpe !== undefined || mesg.workoutFeel !== undefined,
  );
  return session ? selfEvaluationFromSession(session) : NONE;
}
