/**
 * SharpIt-native Energy Bank (ADR-079).
 *
 * Composite 0–100 battery from readiness, sleep debt, strain (0–21), and stress (0–100).
 * Not Garmin Body Battery. Overnight carry is bounded. Intra-day series is synthetic when
 * only daily inputs exist (upgrade when sample-level stress lands).
 */

import { isSet } from '@sharpit/shared/value';

export const ENERGY_BANK_ALGORITHM_VERSION = 'energy-bank-v1';

const STRAIN_SCALE = 21;
const MAX_SLEEP_DEBT_PENALTY = 20;
const MAX_STRAIN_DRAIN = 40;
const MAX_STRESS_DRAIN = 25;
const MAX_OVERNIGHT_CARRY = 12;
const OVERNIGHT_CARRY_RATIO = 0.15;

export type EnergyBankPoint = {
  /** Minutes after local midnight. */
  minuteOfDay: number;
  value: number;
};

export type EnergyBankInput = {
  readinessScore: number | null;
  sleepDebtMin: number | null;
  /** Day strain on SharpIt’s 0–21 scale. */
  strainScore: number | null;
  /** Garmin daily stress 0–100, or null. */
  stress: number | null;
  /** Previous day’s closing Energy Bank, when known. */
  previousClose: number | null;
  /** Local hour 0–23 for how far strain/stress have applied today. */
  hourOfDay: number;
};

export type EnergyBankResult = {
  algorithmVersion: typeof ENERGY_BANK_ALGORITHM_VERSION;
  value: number | null;
  typicalBaseline: number | null;
  asOfMinuteOfDay: number;
  series: EnergyBankPoint[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sleepDebtPenalty(sleepDebtMin: number | null): number {
  if (!isSet(sleepDebtMin) || sleepDebtMin <= 0) {
    return 0;
  }
  return clamp(Math.round(sleepDebtMin / 15), 0, MAX_SLEEP_DEBT_PENALTY);
}

function strainDrain(strainScore: number | null, progress: number): number {
  if (!isSet(strainScore) || strainScore <= 0) {
    return 0;
  }
  return clamp((strainScore / STRAIN_SCALE) * MAX_STRAIN_DRAIN * progress, 0, MAX_STRAIN_DRAIN);
}

function stressDrain(stress: number | null, progress: number): number {
  if (!isSet(stress) || stress < 45) {
    return 0;
  }
  const raw = stress >= 75 ? MAX_STRESS_DRAIN : stress >= 60 ? 16 : 8;
  return clamp(raw * progress, 0, MAX_STRESS_DRAIN);
}

function overnightCarry(previousClose: number | null): number {
  if (!isSet(previousClose)) {
    return 0;
  }
  return clamp(Math.round(previousClose * OVERNIGHT_CARRY_RATIO), 0, MAX_OVERNIGHT_CARRY);
}

function scoreAtProgress(input: EnergyBankInput, progress: number): number | null {
  if (!isSet(input.readinessScore)) {
    return null;
  }
  const value =
    input.readinessScore +
    overnightCarry(input.previousClose) -
    sleepDebtPenalty(input.sleepDebtMin) -
    strainDrain(input.strainScore, progress) -
    stressDrain(input.stress, progress);
  return Math.round(clamp(value, 0, 100));
}

/** Compute the day’s Energy Bank and a small synthetic series (wake / midday / now). */
export function runEnergyBankModel(input: EnergyBankInput): EnergyBankResult {
  const hour = clamp(Math.floor(input.hourOfDay), 0, 23);
  const progress = clamp(hour / 22, 0.15, 1);
  const asOfMinuteOfDay = hour * 60;
  const value = scoreAtProgress(input, progress);

  const series: EnergyBankPoint[] = [];
  const wake = scoreAtProgress(input, 0.15);
  if (isSet(wake)) {
    series.push({ minuteOfDay: 7 * 60, value: wake });
  }
  if (hour >= 12) {
    const mid = scoreAtProgress(input, 0.55);
    if (isSet(mid)) {
      series.push({ minuteOfDay: 12 * 60, value: mid });
    }
  }
  if (isSet(value)) {
    series.push({ minuteOfDay: asOfMinuteOfDay, value });
  }

  return {
    algorithmVersion: ENERGY_BANK_ALGORITHM_VERSION,
    value,
    typicalBaseline: null,
    asOfMinuteOfDay,
    series,
  };
}

/** Rolling mean of closing values for `typicalBaseline`. */
export function typicalEnergyBaseline(closes: Array<number | null>): number | null {
  const values = closes.filter((v): v is number => isSet(v));
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
