import { describe, expect, it } from 'vitest';
import {
  endurancePlannedMeters,
  endurancePlannedSeconds,
  type EnduranceBlock,
  type EndurancePrescription,
  type EnduranceSport,
} from './endurance-prescription';
import { withPotentiation } from './endurance-potentiation';

const easy = { metric: 'none' } as const;
const warmupMin = (minutes: number): EnduranceBlock => ({
  kind: 'step',
  step: { kind: 'warmup', duration: { type: 'time', seconds: minutes * 60 }, target: easy },
});
const intervals: EnduranceBlock = {
  kind: 'repeat',
  iterations: 5,
  steps: [
    { kind: 'interval', duration: { type: 'time', seconds: 180 }, target: easy },
    { kind: 'recovery', duration: { type: 'time', seconds: 120 }, target: easy },
  ],
};
const cooldown: EnduranceBlock = {
  kind: 'step',
  step: { kind: 'cooldown', duration: { type: 'time', seconds: 600 }, target: easy },
};
const session = (
  sport: EnduranceSport,
  blocks: EnduranceBlock[] = [warmupMin(15), intervals, cooldown],
): EndurancePrescription => ({ version: 1, sport, blocks });

const strideCount = (prescription: EndurancePrescription) => {
  const [, block] = prescription.blocks;
  return block?.kind === 'repeat' && block.steps[0]?.kind === 'warmup' ? block.iterations : 0;
};

describe('withPotentiation', () => {
  it.each([
    ['RUN', 'RECOVERY', 0],
    ['RUN', 'ENDURANCE', 0],
    ['RUN', 'TEMPO', 2],
    ['RUN', 'THRESHOLD', 4],
    ['RUN', 'VO2MAX', 6],
    ['RUN', 'RACE', 6],
    ['BIKE', 'TEMPO', 0],
    ['BIKE', 'THRESHOLD', 3],
    ['BIKE', 'VO2MAX', 4],
  ] as const)('%s %s gets %i strides', (sport, intensity, count) => {
    expect(strideCount(withPotentiation(session(sport), intensity))).toBe(count);
  });

  it('carves the strides out of the warm-up, so the session keeps its length', () => {
    const before = session('RUN');
    const after = withPotentiation(before, 'THRESHOLD');
    expect(endurancePlannedSeconds(after)).toBe(endurancePlannedSeconds(before));
    const [first] = after.blocks;
    expect(first?.kind === 'step' && first.step.duration).toEqual({
      type: 'time',
      seconds: 11 * 60,
    });
    expect(after.blocks.slice(2)).toEqual(before.blocks.slice(1));
  });

  it('carves a pool warm-up by its lengths', () => {
    const pool: EnduranceBlock = {
      kind: 'step',
      step: { kind: 'warmup', duration: { type: 'distance', meters: 400 }, target: easy },
    };
    const before = session('SWIM', [pool, intervals]);
    const after = withPotentiation(before, 'THRESHOLD');
    expect(strideCount(after)).toBe(4);
    expect(endurancePlannedMeters(after)).toBe(endurancePlannedMeters(before));
  });

  it('leaves a warm-up too short to give five easy minutes', () => {
    expect(strideCount(withPotentiation(session('RUN', [warmupMin(8), intervals]), 'VO2MAX'))).toBe(
      0,
    );
  });

  it('keeps drills the coach already wrote after the warm-up', () => {
    const drills: EnduranceBlock = {
      kind: 'repeat',
      iterations: 3,
      steps: [{ kind: 'warmup', duration: { type: 'time', seconds: 15 }, target: easy }],
    };
    const before = session('RUN', [warmupMin(15), drills, intervals]);
    expect(withPotentiation(before, 'THRESHOLD')).toBe(before);
  });

  it('leaves a session without a warm-up step', () => {
    const before = session('RUN', [intervals, cooldown]);
    expect(withPotentiation(before, 'THRESHOLD')).toBe(before);
  });
});
