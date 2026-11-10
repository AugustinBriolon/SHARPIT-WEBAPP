import { describe, expect, it } from 'vitest';
import { medicalClearanceRule } from './medical-clearance';
import { baseContext, baseProposal } from '../test-fixtures';

describe('medicalClearanceRule', () => {
  it('is silent when no ground owes a go-ahead', () => {
    expect(medicalClearanceRule(baseContext(), baseProposal({ intensity: 'VO2MAX' }))).toEqual([]);
  });

  it('lets easy endurance through while a go-ahead is owed', () => {
    const context = baseContext({ medicalClearanceOwed: true });
    expect(medicalClearanceRule(context, baseProposal({ intensity: 'ENDURANCE' }))).toEqual([]);
  });

  it('rejects anything above endurance while a go-ahead is owed, offering the easy version', () => {
    const context = baseContext({ medicalClearanceOwed: true });
    const [finding] = medicalClearanceRule(context, baseProposal({ intensity: 'TEMPO', load: 80 }));
    expect(finding?.severity).toBe('REJECTED');
    expect(finding?.saferAlternative).toMatchObject({ intensity: 'ENDURANCE', load: 48 });
  });
});
