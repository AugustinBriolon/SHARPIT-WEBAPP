import { describe, expect, it } from 'vitest';
import { buildDiurnalStressSamples, runEnergyBankModel, typicalEnergyBaseline } from '../model';

const base = {
  readinessScore: 70,
  sleepDebtMin: 0,
  strainScore: 0,
  stress: 30,
  previousClose: null,
  hourOfDay: 10,
};

describe('runEnergyBankModel', () => {
  it('returns null without readiness', () => {
    expect(runEnergyBankModel({ ...base, readinessScore: null }).value).toBeNull();
  });

  it('starts near readiness when rested and unloaded', () => {
    const result = runEnergyBankModel(base);
    expect(result.value).toBeGreaterThanOrEqual(65);
    expect(result.value).toBeLessThanOrEqual(75);
    expect(result.algorithmVersion).toBe('energy-bank-v1');
    // Hourly series from 07:00 through hourOfDay (10) → 4 points.
    expect(result.series.map((point) => point.minuteOfDay)).toEqual([420, 480, 540, 600]);
  });

  it('uses the latest stress sample at or before each hour', () => {
    const withSamples = runEnergyBankModel({
      ...base,
      hourOfDay: 14,
      stress: 30,
      stressSamples: [
        { minuteOfDay: 8 * 60, stress: 40 },
        { minuteOfDay: 12 * 60, stress: 80 },
      ],
    });
    const calmEarly = withSamples.series.find((point) => point.minuteOfDay === 9 * 60)?.value;
    const stressedLater = withSamples.series.find((point) => point.minuteOfDay === 13 * 60)?.value;
    expect(calmEarly).toBeDefined();
    expect(stressedLater).toBeDefined();
    expect(stressedLater!).toBeLessThan(calmEarly!);
  });

  it('drains when stress and strain rise', () => {
    const calm = runEnergyBankModel(base).value!;
    const hard = runEnergyBankModel({
      ...base,
      strainScore: 18,
      stress: 80,
      hourOfDay: 18,
    }).value!;
    expect(hard).toBeLessThan(calm);
  });

  it('penalizes sleep debt', () => {
    const rested = runEnergyBankModel(base).value!;
    const debt = runEnergyBankModel({ ...base, sleepDebtMin: 180 }).value!;
    expect(debt).toBeLessThan(rested);
  });
});

describe('typicalEnergyBaseline', () => {
  it('averages known closes', () => {
    expect(typicalEnergyBaseline([60, 70, null, 80])).toBe(70);
  });
});

describe('buildDiurnalStressSamples', () => {
  it('returns nothing without a daily stress average', () => {
    expect(buildDiurnalStressSamples(null, 14)).toEqual([]);
  });

  it('stops at asOfHour and peaks mid-afternoon above the daily mean', () => {
    const samples = buildDiurnalStressSamples(50, 16);
    expect(samples.map((sample) => sample.minuteOfDay)).toEqual([
      7 * 60,
      9 * 60,
      11 * 60,
      13 * 60,
      15 * 60,
    ]);
    const afternoon = samples.find((sample) => sample.minuteOfDay === 15 * 60);
    expect(afternoon?.stress).toBeGreaterThan(50);
    expect(samples[0]?.stress).toBeLessThan(50);
  });
});
