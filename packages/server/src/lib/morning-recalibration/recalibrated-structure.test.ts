import { describe, expect, it } from 'vitest';
import { recalibratedStructure } from './recalibrated-structure';

const EASY_RUN = {
  version: 1,
  sport: 'RUN',
  blocks: [
    {
      kind: 'step',
      step: {
        kind: 'warmup',
        duration: { type: 'time', seconds: 900 },
        target: { metric: 'none' },
      },
    },
    {
      kind: 'step',
      step: {
        kind: 'interval',
        duration: { type: 'time', seconds: 3300 },
        target: { metric: 'pace', pctMin: 72.5, pctMax: 87.5 },
      },
    },
    {
      kind: 'step',
      step: {
        kind: 'cooldown',
        duration: { type: 'time', seconds: 600 },
        target: { metric: 'none' },
      },
    },
  ],
};

describe('recalibratedStructure', () => {
  it('fits the steps of a lightened run to its new length and writes the description again', () => {
    const structure = recalibratedStructure({
      type: 'RUN',
      endurancePrescription: EASY_RUN,
      durationMin: 60,
      intensity: 'RECOVERY',
      toDescription: '15 min échauffement · 55 min endurance · 10 min retour au calme',
    });
    expect(structure.description).toBe(
      '15 min échauffement · 35 min récup · 10 min retour au calme',
    );
    expect(structure.endurancePrescription?.blocks).toHaveLength(3);
  });

  it('drops steps it cannot stretch and describes the session derived from its length', () => {
    const structure = recalibratedStructure({
      type: 'RUN',
      endurancePrescription: {
        ...EASY_RUN,
        blocks: [
          {
            kind: 'repeat',
            iterations: 6,
            steps: [
              {
                kind: 'interval',
                duration: { type: 'distance', meters: 1000 },
                target: { metric: 'pace', pctMin: 97.5, pctMax: 102.5 },
              },
            ],
          },
        ],
      },
      durationMin: 45,
      intensity: 'ENDURANCE',
      toDescription: null,
    });
    expect(structure.endurancePrescription).toBeNull();
    expect(structure.description).toBe('45 min endurance');
  });

  it('keeps a strength session’s adapted prose and touches no steps', () => {
    expect(
      recalibratedStructure({
        type: 'STRENGTH',
        endurancePrescription: null,
        durationMin: 30,
        intensity: 'RECOVERY',
        toDescription: 'Version allégée',
      }),
    ).toEqual({ description: 'Version allégée' });
  });

  it('leaves an endurance session without steps to be derived, as before', () => {
    expect(
      recalibratedStructure({
        type: 'BIKE',
        endurancePrescription: null,
        durationMin: 60,
        intensity: 'RECOVERY',
        toDescription: 'Sortie souple',
      }),
    ).toEqual({ description: 'Sortie souple' });
  });
});
