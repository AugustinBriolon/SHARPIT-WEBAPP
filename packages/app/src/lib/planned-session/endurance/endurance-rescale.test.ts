import { describe, expect, it } from 'vitest';
import type { EndurancePrescription } from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { defaultTargetForIntensity } from '@sharpit/app/lib/planned-session/endurance/endurance-targets';
import { rescaleEndurancePrescription } from './endurance-rescale';

const minutes = (prescription: EndurancePrescription | null) =>
  prescription?.blocks.map((block) =>
    block.kind === 'step' && block.step.duration.type === 'time'
      ? block.step.duration.seconds / 60
      : null,
  );

/** 15 min warm-up · 55 min endurance · 10 min cool-down — the session lightened on 2026-10-25. */
const EASY_RUN: EndurancePrescription = {
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

describe('rescaleEndurancePrescription', () => {
  it('shortens the main block to the new length, warm-up and cool-down kept', () => {
    const rescaled = rescaleEndurancePrescription({
      prescription: EASY_RUN,
      durationMin: 60,
      intensity: 'RECOVERY',
    });
    expect(minutes(rescaled)).toEqual([15, 35, 10]);
  });

  it('gives the main block the target of the new intensity, and leaves the edges free', () => {
    const rescaled = rescaleEndurancePrescription({
      prescription: EASY_RUN,
      durationMin: 60,
      intensity: 'RECOVERY',
    });
    const [warmup, main] = rescaled!.blocks.map((block) =>
      block.kind === 'step' ? block.step : null,
    );
    expect(main?.target).toEqual(defaultTargetForIntensity('RUN', 'RECOVERY').target);
    expect(warmup?.target).toEqual({ metric: 'none' });
  });

  it('shrinks warm-up and cool-down when they would take more than half the session', () => {
    const rescaled = rescaleEndurancePrescription({
      prescription: EASY_RUN,
      durationMin: 40,
      intensity: 'RECOVERY',
    });
    const parts = minutes(rescaled)!;
    expect(parts.reduce((sum, value) => sum! + value!, 0)).toBe(40);
    expect(parts[1]).toBeGreaterThanOrEqual(20);
  });

  it('lengthens the main block on a push', () => {
    expect(
      minutes(
        rescaleEndurancePrescription({
          prescription: EASY_RUN,
          durationMin: 90,
          intensity: 'ENDURANCE',
        }),
      ),
    ).toEqual([15, 65, 10]);
  });

  it('refuses a repeat or a distance step, which arithmetic cannot stretch honestly', () => {
    const intervals: EndurancePrescription = {
      ...EASY_RUN,
      blocks: [
        EASY_RUN.blocks[0],
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
    };
    expect(
      rescaleEndurancePrescription({
        prescription: intervals,
        durationMin: 45,
        intensity: 'TEMPO',
      }),
    ).toBeNull();
  });
});
