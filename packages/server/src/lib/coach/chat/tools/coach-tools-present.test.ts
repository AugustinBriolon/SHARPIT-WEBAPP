import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPresentCoachTools } from './coach-tools-present';
import { coachTypeEnumForSports } from './coach-tools-shared';

const FIXTURES = new URL(
  '../../../../../../app/src/lib/coach/chat/cards/fixtures/',
  import.meta.url,
);
const fixtureInput = (name: string) =>
  (JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as { input: Record<string, unknown> })
    .input;

const RUNNER = ['run', 'strength'] as const;
const tools = buildPresentCoachTools(RUNNER, coachTypeEnumForSports(RUNNER));
const options = { toolCallId: 'call-1', messages: [] } as never;

describe('presentWorkout', () => {
  it('draws a valid workout and stamps the contract version', async () => {
    const output = await tools.presentWorkout.execute!(
      fixtureInput('workout-run-intervals.json') as never,
      options,
    );
    expect(output).toEqual({ ok: true, schemaVersion: 1 });
  });

  it('refuses a sport the athlete does not practise', async () => {
    const output = await tools.presentWorkout.execute!(
      fixtureInput('workout-minimal.json') as never,
      options,
    );
    expect(output).toMatchObject({ ok: false, error: expect.stringMatching(/SWIM/) });
  });

  it('refuses a strength workout without its exercises', async () => {
    const input = { ...fixtureInput('workout-strength.json'), strengthPrescription: undefined };
    const output = await tools.presentWorkout.execute!(input as never, options);
    expect(output).toMatchObject({
      ok: false,
      error: expect.stringMatching(/strengthPrescription/),
    });
  });

  it('narrows its sport enum to the practised sports', () => {
    const schema = tools.presentWorkout.inputSchema as unknown as {
      safeParse: (value: unknown) => { success: boolean };
    };
    expect(schema.safeParse(fixtureInput('workout-run-intervals.json')).success).toBe(true);
    expect(schema.safeParse(fixtureInput('workout-minimal.json')).success).toBe(false);
  });
});

describe('suggestFollowUps', () => {
  it('draws the suggestions as given', async () => {
    const output = await tools.suggestFollowUps.execute!(
      fixtureInput('follow-ups.json') as never,
      options,
    );
    expect(output).toEqual({ ok: true, schemaVersion: 1 });
  });
});
