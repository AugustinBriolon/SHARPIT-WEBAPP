import { describe, expect, it } from 'vitest';
import {
  createPlannedSessionSchema,
  updatePlannedSessionSchema,
} from '@sharpit/server/lib/validators/planned-session';

function runPrescription(sport: 'RUN' | 'BIKE' | 'SWIM') {
  return {
    version: 1,
    sport,
    blocks: [
      {
        kind: 'step',
        step: {
          kind: 'interval',
          duration: { type: 'time', seconds: 600 },
          target: { metric: 'pace', pctMin: 97.5, pctMax: 102.5 },
        },
      },
    ],
  };
}

const baseSession = {
  type: 'RUN',
  date: '2026-08-20',
  description: 'Sortie tempo',
};

describe('createPlannedSessionSchema', () => {
  it('accepts a prescription whose sport matches the session', () => {
    const parsed = createPlannedSessionSchema.safeParse({
      ...baseSession,
      endurancePrescription: runPrescription('RUN'),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a prescription for another sport', () => {
    const parsed = createPlannedSessionSchema.safeParse({
      ...baseSession,
      type: 'BIKE',
      endurancePrescription: runPrescription('RUN'),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['endurancePrescription', 'sport']);
    }
  });

  it('drops the endurance prescription on a strength session', () => {
    const parsed = createPlannedSessionSchema.safeParse({
      ...baseSession,
      type: 'STRENGTH',
      strengthPrescription: {
        version: 1,
        sets: [{ exercise: 'Squat', sets: 3, reps: 5, order: 0 }],
      },
      endurancePrescription: runPrescription('RUN'),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.endurancePrescription).toBeNull();
    }
  });
});

describe('updatePlannedSessionSchema', () => {
  it('marks or unmarks a key session on its own', () => {
    expect(updatePlannedSessionSchema.parse({ isKey: true })).toEqual({ isKey: true });
    expect(updatePlannedSessionSchema.safeParse({ isKey: 'false' }).success).toBe(false);
  });

  it('rejects a mismatched sport when the patch carries the type', () => {
    const parsed = updatePlannedSessionSchema.safeParse({
      type: 'SWIM',
      description: 'Natation',
      endurancePrescription: runPrescription('RUN'),
    });
    expect(parsed.success).toBe(false);
  });

  it('leaves the check to the route when the patch omits the type', () => {
    // The stored session type is the only reference then — enforced in the PATCH handler.
    const parsed = updatePlannedSessionSchema.safeParse({
      endurancePrescription: runPrescription('RUN'),
    });
    expect(parsed.success).toBe(true);
  });
});
