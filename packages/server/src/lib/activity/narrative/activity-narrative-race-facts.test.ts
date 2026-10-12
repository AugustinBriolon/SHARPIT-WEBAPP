import { describe, expect, it } from 'vitest';
import { buildRaceNarrativeLines } from '@sharpit/server/lib/activity/narrative/activity-narrative-race-facts';

describe('buildRaceNarrativeLines', () => {
  it('states the goal, the gap to target, each leg and the run drift', () => {
    const lines = buildRaceNarrativeLines(
      {
        target: { label: 'Sub 5h30', seconds: 19800 },
        total: { seconds: 20403, deltaSec: 603 },
        legs: [
          {
            kind: 'bike',
            label: 'Vélo',
            durationSec: 11514,
            distanceM: 90_000,
            sourceActivityId: 'bike',
            avgHr: 142,
            hrZonesSec: [0, 5000, 5000, 1514, 0],
            pacing: { unit: 'kmh', firstHalf: 29.1, secondHalf: 27.4, changePct: 6.2 },
          },
        ],
        runHrDriftPct: 8.4,
        load: { tss: 312.4, recoveryHours: null },
      },
      'Half IronMan Versailles',
    );
    const text = lines.join('\n');
    expect(text).toContain('Course visée : Half IronMan Versailles');
    expect(text).toContain('au-dessus de la cible');
    expect(text).toContain('ralentissement 6.2 %');
    expect(text).toContain('Z2 43 %');
    expect(text).toContain('8.4 %');
    expect(text).toContain('312 TSS');
  });
});
