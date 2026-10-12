/**
 * SharpIt-native Energy Bank (ADR-079).
 *
 * Composite 0–100 battery from readiness, sleep debt, strain (0–21), and stress (0–100).
 * Not Garmin Body Battery. Overnight carry is bounded. Intra-day series is hourly synthetic
 * when only daily inputs exist; optional stress samples refine the drain curve.
 */

import { isSet } from '@sharpit/shared/value';

export const ENERGY_BANK_ALGORITHM_VERSION = 'energy-bank-v1';

const STRAIN_SCALE = 21;
const MAX_SLEEP_DEBT_PENALTY = 20;
const MAX_STRAIN_DRAIN = 40;
const MAX_STRESS_DRAIN = 25;
const MAX_OVERNIGHT_CARRY = 12;
const OVERNIGHT_CARRY_RATIO = 0.15;
/** Local wake hour used as the series origin when no samples exist. */
const SERIES_WAKE_HOUR = 7;

export type EnergyBankPoint = {
  /** Minutes after local midnight. */
  minuteOfDay: number;
  value: number;
};

/** Optional intra-day stress (0–100) samples, ascending by minuteOfDay. */
export type EnergyBankStressSample = {
  minuteOfDay: number;
  stress: number;
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
  /**
   * Sample-level stress when available (Garmin detail / HealthKit). Absent → constant
   * daily stress for the synthetic hourly series.
   */
  stressSamples?: readonly EnergyBankStressSample[];
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

function stressAtMinute(
  samples: readonly EnergyBankStressSample[] | undefined,
  minuteOfDay: number,
  fallback: number | null,
): number | null {
  if (!samples || samples.length === 0) {
    return fallback;
  }
  let latest: number | null = null;
  for (const sample of samples) {
    if (sample.minuteOfDay > minuteOfDay) {
      break;
    }
    latest = sample.stress;
  }
  return latest ?? fallback;
}

function scoreAtProgress(
  input: EnergyBankInput,
  progress: number,
  stressOverride: number | null = input.stress,
): number | null {
  if (!isSet(input.readinessScore)) {
    return null;
  }
  const value =
    input.readinessScore +
    overnightCarry(input.previousClose) -
    sleepDebtPenalty(input.sleepDebtMin) -
    strainDrain(input.strainScore, progress) -
    stressDrain(stressOverride, progress);
  return Math.round(clamp(value, 0, 100));
}

/** Hourly series from wake (or earlier `asOf`) through `asOfHour`, using sample stress when present. */
function buildHourlySeries(input: EnergyBankInput, asOfHour: number): EnergyBankPoint[] {
  const endHour = clamp(asOfHour, 0, 23);
  const startHour = endHour < SERIES_WAKE_HOUR ? endHour : SERIES_WAKE_HOUR;
  const series: EnergyBankPoint[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    const minuteOfDay = hour * 60;
    const progress = clamp(hour / 22, 0.15, 1);
    const stress = stressAtMinute(input.stressSamples, minuteOfDay, input.stress);
    const value = scoreAtProgress(input, progress, stress);
    if (isSet(value)) {
      series.push({ minuteOfDay, value });
    }
  }
  return series;
}

/** Compute the day’s Energy Bank and an hourly synthetic series (wake → now). */
export function runEnergyBankModel(input: EnergyBankInput): EnergyBankResult {
  const hour = clamp(Math.floor(input.hourOfDay), 0, 23);
  const progress = clamp(hour / 22, 0.15, 1);
  const asOfMinuteOfDay = hour * 60;
  const stressNow = stressAtMinute(input.stressSamples, asOfMinuteOfDay, input.stress);
  const value = scoreAtProgress(input, progress, stressNow);
  const series = buildHourlySeries(input, hour);

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

/**
 * Synthetic intra-day stress curve when only a daily stress average exists.
 * Quiet morning → afternoon peak → milder evening. Weights average ~1.0 so the
 * daily mean is preserved. Real sample streams (Garmin detail / HealthKit) should
 * replace this once ingested.
 */
const DIURNAL_STRESS_SHAPE: ReadonlyArray<{ hour: number; weight: number }> = [
  { hour: 7, weight: 0.7 },
  { hour: 9, weight: 0.75 },
  { hour: 11, weight: 0.9 },
  { hour: 13, weight: 1.05 },
  { hour: 15, weight: 1.2 },
  { hour: 17, weight: 1.15 },
  { hour: 19, weight: 1.0 },
  { hour: 21, weight: 0.85 },
];

export function buildDiurnalStressSamples(
  dailyStress: number | null,
  asOfHour: number,
): EnergyBankStressSample[] {
  if (!isSet(dailyStress)) {
    return [];
  }
  const endHour = clamp(Math.floor(asOfHour), 0, 23);
  return DIURNAL_STRESS_SHAPE.filter((point) => point.hour <= endHour).map((point) => ({
    minuteOfDay: point.hour * 60,
    stress: clamp(Math.round(dailyStress * point.weight), 0, 100),
  }));
}
