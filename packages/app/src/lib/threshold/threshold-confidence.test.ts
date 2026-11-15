import { describe, expect, it } from 'vitest';
import { assessFtpConfidence, meanOverBestWindow, type FtpEvidence } from './threshold-confidence';

const effort = (overrides: Partial<FtpEvidence> = {}): FtpEvidence => ({
  watts: 183,
  seconds: 1200,
  date: '2026-09-03T17:00:00.000Z',
  avgHr: 140,
  ...overrides,
});

describe('meanOverBestWindow', () => {
  it('reads the signal where the drive was highest, not where the signal was', () => {
    const watts = [100, 100, 300, 300, 100, 100];
    const heartRate = [180, 180, 150, 152, 120, 120];
    expect(meanOverBestWindow(watts, heartRate, 2)).toBe(151);
  });

  it('leaves heart-rate dropouts out of the mean', () => {
    expect(meanOverBestWindow([300, 300, 300], [150, 0, 160], 3)).toBe(155);
  });

  it('answers nothing for a recording shorter than the window or without heart rate', () => {
    expect(meanOverBestWindow([300, 300], [150, 150], 3)).toBeNull();
    expect(meanOverBestWindow([300, 300], [0, 0], 2)).toBeNull();
    expect(meanOverBestWindow([300, 300], [], 2)).toBeNull();
  });
});

describe('assessFtpConfidence', () => {
  it('has nothing to say without a recorded effort', () => {
    expect(assessFtpConfidence(null, 194)).toEqual({ level: 'none' });
  });

  it('reads a comfortable best effort as a floor, with no bike threshold heart rate', () => {
    expect(assessFtpConfidence(effort({ avgHr: 140 }), 194)).toEqual({
      level: 'floor',
      evidence: effort({ avgHr: 140 }),
      bikeLthr: null,
    });
  });

  it('verifies an effort held near max heart rate and reads the bike threshold from it', () => {
    const result = assessFtpConfidence(effort({ avgHr: 170 }), 194);
    expect(result).toMatchObject({ level: 'verified', bikeLthr: 165 });
  });

  it('takes the mean heart rate of an hour effort as the threshold itself', () => {
    const result = assessFtpConfidence(effort({ seconds: 3600, avgHr: 168 }), 194);
    expect(result).toMatchObject({ level: 'verified', bikeLthr: 168 });
  });

  it('does not read a threshold heart rate from a ten-minute effort', () => {
    const result = assessFtpConfidence(effort({ seconds: 600, avgHr: 175 }), 194);
    expect(result).toMatchObject({ level: 'verified', bikeLthr: null });
  });

  it('keeps an effort a floor when heart rate or max heart rate is unknown', () => {
    expect(assessFtpConfidence(effort({ avgHr: null }), 194).level).toBe('floor');
    expect(assessFtpConfidence(effort({ avgHr: 180 }), null).level).toBe('floor');
  });
});
