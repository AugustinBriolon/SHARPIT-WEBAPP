import { Encoder, Profile, type Mesg } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { readSelfEvaluation, selfEvaluationFromSession } from './garmin-fit-evaluation';

function fitWithSession(session: Record<string, number>): Uint8Array {
  const fileId: Mesg = { type: 'activity', manufacturer: 'garmin' } as unknown as Mesg;
  const sessionMesg: Mesg = { sport: 'running', ...session } as unknown as Mesg;
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
  encoder.onMesg(Profile.MesgNum.SESSION, sessionMesg);
  return encoder.close();
}

describe('selfEvaluationFromSession', () => {
  it('turns the watch answers into a 1-10 effort and one of the five words', () => {
    expect(selfEvaluationFromSession({ workoutRpe: 60, workoutFeel: 75 })).toEqual({
      rpe: 6,
      feeling: 'Bien',
    });
    expect(selfEvaluationFromSession({ workoutRpe: 100, workoutFeel: 100 })).toEqual({
      rpe: 10,
      feeling: 'Très bien',
    });
    expect(selfEvaluationFromSession({ workoutRpe: 10, workoutFeel: 0 })).toEqual({
      rpe: 1,
      feeling: 'Très mal',
    });
  });

  it('leaves what the watch did not ask null', () => {
    expect(selfEvaluationFromSession({})).toEqual({ rpe: null, feeling: null });
    expect(selfEvaluationFromSession({ workoutRpe: 0 }).rpe).toBeNull();
  });
});

describe('readSelfEvaluation', () => {
  it('reads the answers from the session of a FIT file', () => {
    expect(readSelfEvaluation(fitWithSession({ workoutRpe: 70, workoutFeel: 50 }))).toEqual({
      rpe: 7,
      feeling: 'Correct',
    });
  });

  it('finds nothing in a session without answers, or in bytes that are not a FIT', () => {
    expect(readSelfEvaluation(fitWithSession({ totalTimerTime: 3600 }))).toEqual({
      rpe: null,
      feeling: null,
    });
    expect(readSelfEvaluation(new Uint8Array([1, 2, 3]))).toEqual({ rpe: null, feeling: null });
  });
});
