import { describe, expect, it } from 'vitest';
import {
  normalizeCoachPlanGeneration,
  normalizePlanStartTime,
} from '@sharpit/server/lib/coach/plan/normalize-plan-generation';
import { coachPlanGenerationSchema } from '@sharpit/app/lib/validators/coach';

describe('normalizePlanStartTime', () => {
  it('pads single-digit hours', () => {
    expect(normalizePlanStartTime('9:00')).toBe('09:00');
  });

  it('keeps valid HH:mm', () => {
    expect(normalizePlanStartTime('12:15')).toBe('12:15');
  });

  it('drops empty and garbage', () => {
    expect(normalizePlanStartTime('')).toBeNull();
    expect(normalizePlanStartTime('null')).toBeNull();
    expect(normalizePlanStartTime('midi')).toBeNull();
  });
});

describe('normalizeCoachPlanGeneration', () => {
  it('keeps a coach routine that holds, drops one that does not (ADR-114)', () => {
    const run = (routines: unknown) =>
      normalizeCoachPlanGeneration({
        summary: 'x',
        sessions: [
          {
            dayOffset: 0,
            type: 'RUN',
            intensity: 'VO2MAX',
            title: 'VMA',
            durationMin: 50,
            load: 60,
            rationale: 'x',
            routines,
          },
        ],
      });
    const moves = [
      { name: 'Gammes A', dose: '2 × 20 m' },
      { name: 'Skipping', dose: '2 × 20 m' },
      { name: 'Accélérations', dose: '3 × 80 m' },
    ];
    const kept = run({ warmup: moves, cooldown: null });
    expect(kept.ok && kept.plan.sessions[0]?.routines?.warmup).toHaveLength(3);
    const dropped = run({ warmup: [{ name: 'x' }], cooldown: null });
    expect(dropped.ok && dropped.plan.sessions[0]?.routines).toBeNull();
  });

  it('rounds floats and coerces invented strength enums to null', () => {
    const result = normalizeCoachPlanGeneration({
      summary: 'Semaine légère',
      sessions: [
        {
          dayOffset: 1.2,
          startTime: '9:00',
          type: 'STRENGTH',
          intensity: 'RECOVERY',
          title: 'Renfo bassin',
          description: 'Focus hanche',
          durationMin: 45.4,
          load: 30.6,
          rationale: 'Prévention genou',
          strengthPrescription: {
            sets: [
              {
                exercise: 'Clamshell',
                intent: 'STRENGTH',
                pattern: 'HIP_FLEXION_INVENTED',
                sets: 3,
                reps: 15,
                notes: 'ok',
              },
              {
                exercise: 'Planche',
                intent: 'CORE',
                pattern: 'CORE_ANTI_LATERAL',
                sets: 2.2,
                reps: 0,
                durationSec: 30,
              },
            ],
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const [session] = result.plan.sessions;
    expect(session.dayOffset).toBe(1);
    expect(session.startTime).toBe('09:00');
    expect(session.durationMin).toBe(45);
    expect(session.load).toBe(31);
    expect(session.strengthPrescription?.sets[0]).toMatchObject({
      exercise: 'Clamshell',
      intent: 'STRENGTH',
      pattern: null,
    });
    expect(session.strengthPrescription?.sets[1]).toMatchObject({
      exercise: 'Planche',
      pattern: 'CORE_ANTI_LATERAL',
      sets: 2,
      reps: 0,
      durationSec: 30,
    });
  });

  it('rejects empty session lists', () => {
    const result = normalizeCoachPlanGeneration({ summary: 'x', sessions: [] });
    expect(result.ok).toBe(false);
  });

  it('drops invented swim strokes so a week is not discarded', () => {
    const result = normalizeCoachPlanGeneration({
      summary: 'Eau',
      sessions: [
        {
          dayOffset: 0,
          type: 'SWIM',
          intensity: 'ENDURANCE',
          title: 'Nage',
          description: 'crawl',
          durationMin: 40,
          load: 35,
          rationale: 'tech',
          endurancePrescription: {
            blocks: [
              {
                steps: [{ kind: 'interval', meters: 100, effort: 'ENDURANCE', stroke: 'crawl' }],
              },
            ],
            poolLengthM: 25,
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.sessions[0]?.endurancePrescription?.blocks[0]?.steps[0]).toMatchObject({
      kind: 'interval',
      meters: 100,
    });
    expect(result.plan.sessions[0]?.endurancePrescription?.blocks[0]?.steps[0]).not.toHaveProperty(
      'stroke',
    );
  });
});

/**
 * Generation schema is what Output.object validates before normalize runs.
 * Invented endurance enums / float meters must not kill the whole week there.
 */
describe('coachPlanGenerationSchema endurance looseness', () => {
  const looseEnduranceWeek = {
    summary: 'Semaine seuil',
    sessions: [
      {
        dayOffset: 0,
        startTime: '09:00',
        type: 'RUN' as const,
        intensity: 'THRESHOLD' as const,
        title: 'Seuil',
        description: '6x1000',
        durationMin: 60,
        load: 70,
        rationale: 'spé',
        endurancePrescription: {
          blocks: [
            {
              times: 6,
              steps: [
                { kind: 'warm-up', meters: 1000.5, effort: 'THRESHOLD' },
                { kind: 'recovery', minutes: 2, effort: 'RECOVERY' },
              ],
            },
          ],
        },
      },
    ],
  };

  it('accepts float meters and invented step kinds the model invents', () => {
    const parsed = coachPlanGenerationSchema.safeParse(looseEnduranceWeek);
    expect(parsed.success).toBe(true);
  });

  it('still normalizes that payload into a persistable plan', () => {
    const result = normalizeCoachPlanGeneration(looseEnduranceWeek);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.sessions[0]?.endurancePrescription?.blocks[0]?.steps[0]).toMatchObject({
      kind: 'interval',
      meters: 1001,
    });
  });
});
