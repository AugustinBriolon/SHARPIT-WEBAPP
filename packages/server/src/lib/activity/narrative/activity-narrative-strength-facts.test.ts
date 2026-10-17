import { describe, expect, it } from 'vitest';
import {
  buildStrengthFacts,
  type NarrativeStrengthSet,
} from '@sharpit/server/lib/activity/narrative/activity-narrative-facts';

const set = (overrides: Partial<NarrativeStrengthSet>): NarrativeStrengthSet => ({
  exercise: 'Squat',
  sets: 4,
  reps: 8,
  durationSec: null,
  weightKg: null,
  rpe: null,
  restSec: null,
  notes: null,
  ...overrides,
});

describe('buildStrengthFacts', () => {
  it('lists each exercise with load, effort and rest after a total', () => {
    expect(
      buildStrengthFacts([
        set({ weightKg: 60, rpe: 8, restSec: 90 }),
        set({ exercise: 'Gainage', sets: 3, reps: 1, durationSec: 45, notes: 'dos ok' }),
      ]),
    ).toEqual([
      '2 exercices, 7 séries au total.',
      '- Squat : 4 × 8 rép. à 60 kg, RPE 8/10, repos 90 s',
      '- Gainage : 3 × 45 s (dos ok)',
    ]);
  });

  it('says nothing when no set was logged', () => {
    expect(buildStrengthFacts([])).toEqual([]);
  });
});
