import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COACH_CARDS_SCHEMA_VERSION,
  coachFollowUpsSchema,
  coachWorkoutCardProblem,
  coachWorkoutCardSchema,
  type CoachWorkoutCard,
} from './coach-cards';

const FIXTURES = new URL('./fixtures/', import.meta.url);
// The iPhone app decodes its own copy of these files (SHARPIT-APP, sibling repository).
const IOS_FIXTURES = new URL(
  '../../../../../../../../SHARPIT-APP/SHARPIT-APPTests/Fixtures/CoachCards/',
  import.meta.url,
);

type FixturePart = { type: string; state: string; input: unknown; output?: unknown };

function fixture(name: string): FixturePart {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as FixturePart;
}

describe('coach cards contract v1', () => {
  it.each(['workout-run-intervals.json', 'workout-strength.json', 'workout-minimal.json'])(
    'accepts %s as a drawable workout',
    (name) => {
      const parsed = coachWorkoutCardSchema.safeParse(fixture(name).input);
      expect(parsed.success).toBe(true);
      expect(coachWorkoutCardProblem(parsed.data as CoachWorkoutCard)).toBeNull();
    },
  );

  it('rejects a workout with a missing title, a non-numeric duration and null warnings', () => {
    const parsed = coachWorkoutCardSchema.safeParse(fixture('workout-invalid.json').input);
    expect(parsed.success).toBe(false);
    const paths = parsed.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['title', 'durationMin', 'warnings']));
  });

  it('accepts the follow-ups fixture and caps suggestions at three', () => {
    expect(coachFollowUpsSchema.safeParse(fixture('follow-ups.json').input).success).toBe(true);
    expect(coachFollowUpsSchema.safeParse({ suggestions: ['a1', 'b2', 'c3', 'd4'] }).success).toBe(
      false,
    );
    expect(coachFollowUpsSchema.safeParse({ suggestions: [] }).success).toBe(false);
  });

  it('stamps every fixture output with the current schema version', () => {
    for (const name of readdirSync(FIXTURES)) {
      const { output } = fixture(name);
      if (output) {
        expect(output).toEqual({ ok: true, schemaVersion: COACH_CARDS_SCHEMA_VERSION });
      }
    }
  });

  it('names what makes a workout undrawable', () => {
    const run = coachWorkoutCardSchema.parse(fixture('workout-run-intervals.json').input);
    expect(coachWorkoutCardProblem({ ...run, type: 'STRENGTH' })).toMatch(/strengthPrescription/);
    const strength = coachWorkoutCardSchema.parse(fixture('workout-strength.json').input);
    expect(coachWorkoutCardProblem({ ...strength, type: 'RUN' })).toMatch(/STRENGTH/);
  });

  it.skipIf(!existsSync(IOS_FIXTURES))('keeps the iPhone copy of the fixtures identical', () => {
    for (const name of readdirSync(FIXTURES)) {
      expect(readFileSync(new URL(name, IOS_FIXTURES), 'utf8'), name).toBe(
        readFileSync(new URL(name, FIXTURES), 'utf8'),
      );
    }
  });
});
