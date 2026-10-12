import { describe, expect, it } from 'vitest';
import { runEnergyBankModel, typicalEnergyBaseline } from '../model';

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
    expect(result.series.length).toBeGreaterThan(0);
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
