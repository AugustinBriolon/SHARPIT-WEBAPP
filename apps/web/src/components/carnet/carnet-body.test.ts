import { describe, expect, it } from 'vitest';
import { ringDash, sleepStages } from './carnet-body';

describe('ringDash', () => {
  it('fills the share of the ring the value stands for', () => {
    const [filled, circumference] = ringDash(50, 100, 10);
    expect(circumference).toBeCloseTo(2 * Math.PI * 10);
    expect(filled).toBeCloseTo(circumference / 2);
  });

  it('never draws past the ring or before it', () => {
    expect(ringDash(140, 100, 10)[0]).toBeCloseTo(ringDash(100, 100, 10)[1]);
    expect(ringDash(-5, 100, 10)[0]).toBe(0);
  });
});

describe('sleepStages', () => {
  it('splits the night into shares that sum to one, in reading order', () => {
    const stages = sleepStages({ deep: 90, rem: 90, light: 240, awake: 60 });
    expect(stages.map((stage) => stage.key)).toEqual(['deep', 'rem', 'light', 'awake']);
    expect(stages[2]?.share).toBeCloseTo(0.5);
    expect(stages.reduce((sum, stage) => sum + stage.share, 0)).toBeCloseTo(1);
  });

  it('leaves out a stage the night did not record', () => {
    const stages = sleepStages({ deep: 80, rem: null, light: 220, awake: 0 });
    expect(stages.map((stage) => stage.key)).toEqual(['deep', 'light']);
  });

  it('returns nothing for a night with no stages', () => {
    expect(sleepStages({ deep: null, rem: null, light: null, awake: null })).toEqual([]);
  });
});
