import { describe, expect, it } from 'vitest';
import { detectCoachPlaybookSituation } from './detect-playbook-situation';

describe('detectCoachPlaybookSituation', () => {
  it('flags pain when physical notes are present', () => {
    expect(
      detectCoachPlaybookSituation({ physical: [{ id: 'n1' }], recent: [{ date: '2026-10-12' }] }),
    ).toBe('pain');
  });

  it('flags absence after a multi-day gap', () => {
    expect(
      detectCoachPlaybookSituation(
        { physical: [], recent: [{ dateIso: '2026-10-01' }] },
        '2026-10-13',
      ),
    ).toBe('absence');
  });

  it('stays quiet when recent activity exists and no pain', () => {
    expect(
      detectCoachPlaybookSituation(
        { physical: [], recent: [{ dateIso: '2026-10-12' }] },
        '2026-10-13',
      ),
    ).toBeNull();
  });
});
