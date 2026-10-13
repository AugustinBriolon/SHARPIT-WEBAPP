/**
 * Light feeling gate (Kotcha-style): full session debrief is shown once the athlete
 * left an RPE and/or notes. Twin / analysis generation is not blocked.
 */

export function sessionHasAthleteFeeling(input: {
  rpe?: number | null;
  notes?: string | null;
  feeling?: string | null;
}): boolean {
  if (typeof input.rpe === 'number' && Number.isFinite(input.rpe) && input.rpe > 0) {
    return true;
  }
  if (input.feeling && input.feeling.trim().length > 0) {
    return true;
  }
  if (input.notes && input.notes.trim().length >= 3) {
    return true;
  }
  return false;
}

export function sessionAnalysisNeedsFeelingGate(input: {
  rpe?: number | null;
  notes?: string | null;
  feeling?: string | null;
  hasAnalysis: boolean;
}): boolean {
  return input.hasAnalysis && !sessionHasAthleteFeeling(input);
}
