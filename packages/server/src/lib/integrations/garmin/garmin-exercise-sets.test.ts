import { describe, expect, it } from 'vitest';
import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';
import {
  parseGarminExerciseSets,
  parseGarminSummarizedExerciseSets,
  resolveGarminStrengthSets,
} from '@sharpit/server/lib/integrations/garmin/garmin-activities';
import { resolveGarminExerciseLabel } from '@sharpit/server/lib/integrations/garmin/garmin-exercise-labels';

const frLabels = new Map<string, string>([
  ['exercise_type_STRETCH_90_90', 'Étirement 90/90'],
  ['exercise_type_STRETCH_CAT_COW', 'Étirement chat et vache'],
  ['exercise_type_STRETCH_LUNGING_HIP_FLEXOR', 'Étirement fléchisseur de la hanche en fente'],
  ['exercise_type_BENCH_PRESS', 'Développé couché'],
  ['exercise_type_BARBELL_BENCH_PRESS', 'Développé couché barre'],
  ['exercise_type_CURL', 'Curl'],
  ['exercise_type_DUMBBELL_CURL', 'Curl haltères'],
]);

function strengthActivity(summarizedExerciseSets: unknown): IActivity {
  return {
    summarizedExerciseSets,
  } as IActivity;
}

describe('resolveGarminExerciseLabel', () => {
  it('uses Garmin French catalog labels', () => {
    expect(resolveGarminExerciseLabel('STRETCH', 'STRETCH_90_90', frLabels)).toBe(
      'Étirement 90/90',
    );
    expect(resolveGarminExerciseLabel('UNKNOWN', 'UNKNOWN', frLabels)).toBe('Inconnu');
  });
});

describe('parseGarminSummarizedExerciseSets', () => {
  it('maps per-exercise aggregates from the activities list', () => {
    const result = parseGarminSummarizedExerciseSets(
      strengthActivity([
        {
          category: 'BENCH_PRESS',
          subCategory: 'BARBELL_BENCH_PRESS',
          sets: 3,
          reps: 30,
          maxWeight: 50000,
        },
        {
          category: 'CURL',
          subCategory: 'DUMBBELL_CURL',
          sets: 3,
          reps: 24,
          maxWeight: 20000,
        },
      ]),
      frLabels,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      exercise: 'Développé couché barre',
      sets: 3,
      reps: 10,
      weightKg: 50,
    });
  });
});

describe('parseGarminExerciseSets', () => {
  it('groups continuation sets without exercise metadata under the same exercise', () => {
    const result = parseGarminExerciseSets(
      {
        exerciseSets: [
          {
            setType: 'ACTIVE',
            repetitionCount: 10,
            weight: 50000,
            exercises: [
              { category: 'BENCH_PRESS', name: 'BARBELL_BENCH_PRESS', probability: 0.98 },
            ],
          },
          {
            setType: 'REST',
            duration: 90,
            exercises: [],
          },
          {
            setType: 'ACTIVE',
            repetitionCount: 8,
            weight: 50000,
            exercises: [],
          },
        ],
      },
      frLabels,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      exercise: 'Développé couché barre',
      sets: 2,
      reps: 9,
      weightKg: 50,
      restSec: 90,
    });
  });

  it('preserves workout order and timed stretch durations', () => {
    const result = parseGarminExerciseSets(
      {
        exerciseSets: [
          {
            setType: 'ACTIVE',
            duration: 60,
            exercises: [{ category: 'STRETCH', name: 'STRETCH_90_90', probability: 1 }],
          },
          {
            setType: 'ACTIVE',
            duration: 60,
            exercises: [],
          },
          {
            setType: 'ACTIVE',
            duration: 120,
            exercises: [{ category: 'STRETCH', name: 'STRETCH_CAT_COW', probability: 1 }],
          },
          {
            setType: 'ACTIVE',
            duration: 60,
            exercises: [
              { category: 'STRETCH', name: 'STRETCH_LUNGING_HIP_FLEXOR', probability: 1 },
            ],
          },
          {
            setType: 'ACTIVE',
            duration: 60,
            exercises: [],
          },
          {
            setType: 'ACTIVE',
            duration: 60,
            exercises: [],
          },
          {
            setType: 'ACTIVE',
            duration: 60,
            exercises: [],
          },
          {
            setType: 'ACTIVE',
            duration: 60,
            exercises: [{ category: 'UNKNOWN', name: 'UNKNOWN', probability: 1 }],
          },
          {
            setType: 'ACTIVE',
            duration: 62,
            exercises: [],
          },
        ],
      },
      frLabels,
    );

    expect(result.map((row) => row.exercise)).toEqual([
      'Étirement 90/90',
      'Étirement chat et vache',
      'Étirement fléchisseur de la hanche en fente',
      'Inconnu',
    ]);
    expect(result[0]).toMatchObject({ sets: 2, durationSec: 60 });
    expect(result[1]).toMatchObject({ sets: 1, durationSec: 120 });
    expect(result[2]).toMatchObject({ sets: 4, durationSec: 60 });
    expect(result[3]).toMatchObject({ sets: 2, durationSec: 61 });
  });

  it('counts timed sets without repetitionCount', () => {
    const result = parseGarminExerciseSets(
      {
        exerciseSets: [
          {
            setType: 'ACTIVE',
            duration: 45,
            exercises: [{ category: 'PLANK', name: 'PLANK', probability: 1 }],
          },
        ],
      },
      frLabels,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sets: 1, reps: 1, durationSec: 45 });
  });
});

describe('resolveGarminStrengthSets', () => {
  it('falls back to summarized sets when detailed parsing is broken', () => {
    const activity = strengthActivity([
      {
        category: 'BENCH_PRESS',
        subCategory: 'BARBELL_BENCH_PRESS',
        sets: 3,
        reps: 30,
        maxWeight: 50000,
      },
      {
        category: 'CURL',
        subCategory: 'DUMBBELL_CURL',
        sets: 3,
        reps: 24,
        maxWeight: 20000,
      },
    ]);

    const resolved = resolveGarminStrengthSets(
      activity,
      [
        {
          exercise: 'Exercice',
          sets: 6,
          reps: 9,
          durationSec: null,
          weightKg: 50,
          restSec: null,
          order: 0,
        },
      ],
      frLabels,
    );

    expect(resolved).toHaveLength(2);
  });

  it('prefers detailed chronological sets when both sources are complete', () => {
    const activity = strengthActivity([
      {
        category: 'STRETCH',
        subCategory: 'STRETCH_LUNGING_HIP_FLEXOR',
        sets: 4,
        reps: 4,
        duration: 240000,
      },
      {
        category: 'STRETCH',
        subCategory: 'STRETCH_CAT_COW',
        sets: 1,
        reps: 1,
        duration: 120000,
      },
      {
        category: 'STRETCH',
        subCategory: 'STRETCH_90_90',
        sets: 3,
        reps: 3,
        duration: 180000,
      },
    ]);

    const detailed = [
      {
        exercise: 'Étirement 90/90',
        sets: 2,
        reps: 1,
        durationSec: 60,
        weightKg: null,
        restSec: null,
        order: 0,
      },
      {
        exercise: 'Étirement chat et vache',
        sets: 1,
        reps: 1,
        durationSec: 120,
        weightKg: null,
        restSec: null,
        order: 1,
      },
    ];

    const resolved = resolveGarminStrengthSets(activity, detailed, frLabels);
    expect(resolved[0]?.exercise).toBe('Étirement 90/90');
    expect(resolved[0]?.sets).toBe(2);
  });
});
