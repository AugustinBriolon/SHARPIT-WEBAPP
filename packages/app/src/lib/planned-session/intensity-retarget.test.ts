import { describe, expect, it } from 'vitest';
import { renameIntensityInText, retargetStrengthPrescription } from './intensity-retarget';

describe('renameIntensityInText', () => {
  it('names the new intensity in a recovery title, full word first and short word inside', () => {
    expect(
      renameIntensityInText(
        'Récupération 30min (10min échauffement - 15min recup - 5min retour au calme)',
        'RECOVERY',
        'ENDURANCE',
      ),
    ).toBe('Endurance 30min (10min échauffement - 15min endurance - 5min retour au calme)');
  });

  it('leaves a name the athlete chose', () => {
    expect(renameIntensityInText('Footing du lundi', 'RECOVERY', 'ENDURANCE')).toBe(
      'Footing du lundi',
    );
  });

  it('does not touch a word that only contains the intensity', () => {
    expect(renameIntensityInText('Course récupérée', 'RECOVERY', 'TEMPO')).toBe('Course récupérée');
  });
});

describe('retargetStrengthPrescription', () => {
  const circuit = {
    version: 1 as const,
    sets: [
      { exercise: 'Squat', sets: 3, reps: 10, weightKg: 40, order: 0 },
      {
        exercise: 'Hip flexor stretch',
        intent: 'MOBILITY' as const,
        sets: 2,
        reps: 0,
        durationSec: 30,
        order: 1,
      },
    ],
  };

  it('adds sets and load when a recovery circuit is pushed to endurance', () => {
    const pushed = retargetStrengthPrescription({
      prescription: circuit,
      from: 'RECOVERY',
      to: 'ENDURANCE',
    });
    expect(pushed?.sets[0]).toMatchObject({ sets: 4, reps: 10, weightKg: 50 });
  });

  it('keeps a mobility hold as it is', () => {
    const pushed = retargetStrengthPrescription({
      prescription: circuit,
      from: 'RECOVERY',
      to: 'ENDURANCE',
    });
    expect(pushed?.sets[1]).toEqual(circuit.sets[1]);
  });

  it('lightens on the way down and changes nothing at the same intensity', () => {
    const eased = retargetStrengthPrescription({
      prescription: circuit,
      from: 'TEMPO',
      to: 'RECOVERY',
    });
    expect(eased?.sets[0]).toMatchObject({ sets: 2, weightKg: 28 });
    expect(
      retargetStrengthPrescription({ prescription: circuit, from: 'TEMPO', to: 'TEMPO' }),
    ).toBeNull();
  });
});
