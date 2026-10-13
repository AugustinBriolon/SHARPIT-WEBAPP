/** Reasons attached to tool approval responses — surfaced to the model on continue. */
export const COACH_APPROVAL_REASON = {
  approved: 'Appliqué par l’athlète',
  denied:
    'Ignoré par l’athlète — ne pas appliquer cette action ; proposer une alternative ou demander une précision',
  revise:
    'L’athlète demande une version modifiée — ne pas appliquer ; reformuler la proposition selon son prochain message',
} as const;

export type CoachApprovalOutcome = 'approved' | 'denied' | 'revise';

export function coachApprovalReason(approved: boolean): string {
  return approved ? COACH_APPROVAL_REASON.approved : COACH_APPROVAL_REASON.denied;
}

export function coachApprovalReasonForOutcome(outcome: CoachApprovalOutcome): string {
  if (outcome === 'approved') {
    return COACH_APPROVAL_REASON.approved;
  }
  if (outcome === 'revise') {
    return COACH_APPROVAL_REASON.revise;
  }
  return COACH_APPROVAL_REASON.denied;
}
