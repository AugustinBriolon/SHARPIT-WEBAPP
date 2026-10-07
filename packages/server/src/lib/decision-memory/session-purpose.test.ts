import { describe, expect, it } from 'vitest';
import { mapPurposesFromActions, purposeFromProposal } from './session-purpose';

describe('purposeFromProposal', () => {
  it('returns a trimmed rationale', () => {
    expect(purposeFromProposal({ rationale: '  Base aérobie.  ' })).toBe('Base aérobie.');
  });

  it('returns null for missing, blank, or non-string rationale', () => {
    expect(purposeFromProposal(null)).toBeNull();
    expect(purposeFromProposal({})).toBeNull();
    expect(purposeFromProposal({ rationale: '   ' })).toBeNull();
    expect(purposeFromProposal({ rationale: 12 })).toBeNull();
  });
});

describe('mapPurposesFromActions', () => {
  it('keeps the first purpose per session (newest-first input)', () => {
    const map = mapPurposesFromActions([
      { resultingPlannedSessionId: 's1', proposal: { rationale: 'Récent' } },
      { resultingPlannedSessionId: 's1', proposal: { rationale: 'Ancien' } },
      { resultingPlannedSessionId: 's2', proposal: { rationale: 'Autre' } },
      { resultingPlannedSessionId: null, proposal: { rationale: 'Ignoré' } },
      { resultingPlannedSessionId: 's3', proposal: { rationale: '' } },
    ]);
    expect(Object.fromEntries(map)).toEqual({ s1: 'Récent', s2: 'Autre' });
  });
});
