import { describe, expect, it } from 'vitest';
import {
  coachApprovalReason,
  coachApprovalReasonForOutcome,
  COACH_APPROVAL_REASON,
} from '@sharpit/app/lib/coach/plan/coach-approval-reason';

describe('coachApprovalReason', () => {
  it('marks denial so the model must not treat the action as done', () => {
    expect(coachApprovalReason(false)).toBe(COACH_APPROVAL_REASON.denied);
    expect(coachApprovalReason(false).toLowerCase()).toContain('ignoré');
  });

  it('marks approval explicitly', () => {
    expect(coachApprovalReason(true)).toBe(COACH_APPROVAL_REASON.approved);
    expect(coachApprovalReason(true).toLowerCase()).toContain('appliqué');
  });

  it('marks revise so the model must reformulate', () => {
    expect(coachApprovalReasonForOutcome('revise')).toBe(COACH_APPROVAL_REASON.revise);
    expect(coachApprovalReasonForOutcome('revise').toLowerCase()).toContain('modifiée');
  });
});
