import { z } from 'zod';
import type { RawStreams } from '@sharpit/server/lib/integrations/garmin/garmin-streams';

/** Source closed enum — watch optical or BLE chest/arm strap. */
export const LIVE_HR_SOURCES = ['watch', 'ble'] as const;
export type LiveHrSource = (typeof LIVE_HR_SOURCES)[number];

/** Absolute cap: ~4 h at 5 s + margin (never denser than that for this contract). */
export const LIVE_HR_ABSOLUTE_MAX_SAMPLES = 3_000;

/** Margin above durationSec/5 for clock skew / slightly faster sampling. */
export const LIVE_HR_SAMPLE_MARGIN = 24;

/** Client avg/max may differ from recomputed by at most this many bpm. */
export const LIVE_HR_SUMMARY_TOLERANCE_BPM = 2;

export const liveHrSampleSchema = z.object({
  t: z.number().int().min(0),
  bpm: z.number().int().min(25).max(250),
  source: z.enum(LIVE_HR_SOURCES),
});

export type LiveHrSample = z.infer<typeof liveHrSampleSchema>;

export type LiveHrMeta = {
  clientSessionId: string;
  /** Dominant source among samples with signal (majority). */
  source: LiveHrSource;
};

export type LiveHrValidationCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_BPM'
  | 'INVALID_SAMPLE_TIME'
  | 'INVALID_SAMPLE_SOURCE'
  | 'TOO_MANY_SAMPLES'
  | 'EMPTY_HR_SAMPLES'
  | 'AVG_HR_INCONSISTENT'
  | 'MAX_HR_INCONSISTENT';

export type LiveHrValidationOk = {
  ok: true;
  avgHr: number;
  maxHr: number;
  source: LiveHrSource;
  raw: RawStreams;
  sampleCount: number;
  coverageSec: number;
};

export type LiveHrValidationErr = {
  ok: false;
  code: LiveHrValidationCode;
};

export function maxLiveHrSamples(durationSec: number): number {
  const byDuration = Math.floor(durationSec / 5) + LIVE_HR_SAMPLE_MARGIN;
  return Math.min(Math.max(byDuration, 1), LIVE_HR_ABSOLUTE_MAX_SAMPLES);
}

/**
 * Seconds of the session covered by a heart-rate signal.
 * Gaps larger than 30 s do not count as continuous coverage.
 */
export function hrCoverageSec(
  raw: Pick<RawStreams, 'time' | 'heartrate'> | null | undefined,
): number {
  if (!raw?.heartrate?.length || !raw.time.length) {
    return 0;
  }
  let covered = 0;
  for (let i = 0; i < raw.heartrate.length; i++) {
    if ((raw.heartrate[i] ?? 0) <= 0) {
      continue;
    }
    if (i === 0) {
      covered += 5;
      continue;
    }
    const dt = (raw.time[i] ?? 0) - (raw.time[i - 1] ?? 0);
    if (dt > 0 && dt <= 30) {
      covered += dt;
    } else if (dt > 30) {
      covered += 5;
    }
  }
  return covered;
}

export function preferHrStream(
  a: Pick<RawStreams, 'time' | 'heartrate'> | null | undefined,
  b: Pick<RawStreams, 'time' | 'heartrate'> | null | undefined,
): 'a' | 'b' | 'tie' {
  const ca = hrCoverageSec(a);
  const cb = hrCoverageSec(b);
  if (cb > ca) {
    return 'b';
  }
  if (ca > cb) {
    return 'a';
  }
  return 'tie';
}

function recomputeSummary(samples: LiveHrSample[]): { avgHr: number; maxHr: number } | null {
  if (samples.length === 0) {
    return null;
  }
  let sum = 0;
  let max = 0;
  for (const sample of samples) {
    sum += sample.bpm;
    if (sample.bpm > max) {
      max = sample.bpm;
    }
  }
  return { avgHr: Math.round(sum / samples.length), maxHr: max };
}

function dominantSource(samples: LiveHrSample[]): LiveHrSource {
  let ble = 0;
  let watch = 0;
  for (const sample of samples) {
    if (sample.source === 'ble') {
      ble += 1;
    } else {
      watch += 1;
    }
  }
  return ble > watch ? 'ble' : 'watch';
}

/**
 * Densify sparse live samples onto a 5 s grid for the session duration.
 * Missing slots stay 0 so the chart can show gaps (no interpolation).
 */
export function liveHrSamplesToRawStreams(
  samples: LiveHrSample[],
  durationSec: number,
): RawStreams {
  const step = 5;
  const lastT = Math.max(0, Math.floor(durationSec));
  const slotCount = Math.floor(lastT / step) + 1;
  const time: number[] = [];
  const heartrate: number[] = [];
  for (let i = 0; i < slotCount; i++) {
    time.push(i * step);
    heartrate.push(0);
  }

  // Last sample wins a slot when several land in the same 5 s window.
  for (const sample of samples) {
    if (sample.t > durationSec) {
      continue;
    }
    const slot = Math.min(Math.round(sample.t / step), slotCount - 1);
    heartrate[slot] = sample.bpm;
  }

  return {
    time,
    heartrate,
    distance: [],
    altitude: [],
    watts: [],
    cadence: [],
    velocity: [],
    latlng: [],
  };
}

function sampleParseErrorCode(path: unknown): LiveHrValidationCode {
  if (path === 'bpm') {
    return 'INVALID_BPM';
  }
  if (path === 't') {
    return 'INVALID_SAMPLE_TIME';
  }
  if (path === 'source') {
    return 'INVALID_SAMPLE_SOURCE';
  }
  return 'INVALID_PAYLOAD';
}

function parseLiveHrSampleRows(
  rows: unknown[],
  durationSec: number,
): { ok: true; samples: LiveHrSample[] } | LiveHrValidationErr {
  const samples: LiveHrSample[] = [];
  for (const row of rows) {
    const parsed = liveHrSampleSchema.safeParse(row);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const [path] = issue?.path ?? [];
      return { ok: false, code: sampleParseErrorCode(path) };
    }
    if (parsed.data.t > durationSec) {
      return { ok: false, code: 'INVALID_SAMPLE_TIME' };
    }
    samples.push(parsed.data);
  }
  return { ok: true, samples };
}

function summaryConsistencyCode(
  clientAvg: number,
  clientMax: number,
  summary: { avgHr: number; maxHr: number },
): LiveHrValidationCode | null {
  if (Math.abs(clientAvg - summary.avgHr) > LIVE_HR_SUMMARY_TOLERANCE_BPM) {
    return 'AVG_HR_INCONSISTENT';
  }
  if (Math.abs(clientMax - summary.maxHr) > LIVE_HR_SUMMARY_TOLERANCE_BPM) {
    return 'MAX_HR_INCONSISTENT';
  }
  return null;
}

/**
 * Validate live HR samples against duration and client avg/max.
 * Recomputes avg/max from samples — client values must match within tolerance.
 * Returns RawStreams ready to persist (gaps as 0). Never logs bpm values.
 */
export function validateLiveHrSamples(input: {
  durationSec: number;
  avgHr: number;
  maxHr: number;
  hrSamples: unknown;
}): LiveHrValidationOk | LiveHrValidationErr {
  const { durationSec, avgHr, maxHr } = input;
  if (!Number.isInteger(durationSec) || durationSec < 1 || !Array.isArray(input.hrSamples)) {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }
  if (input.hrSamples.length === 0) {
    return { ok: false, code: 'EMPTY_HR_SAMPLES' };
  }
  if (input.hrSamples.length > maxLiveHrSamples(durationSec)) {
    return { ok: false, code: 'TOO_MANY_SAMPLES' };
  }

  const parsedRows = parseLiveHrSampleRows(input.hrSamples, durationSec);
  if (!parsedRows.ok) {
    return parsedRows;
  }

  const summary = recomputeSummary(parsedRows.samples);
  if (!summary) {
    return { ok: false, code: 'EMPTY_HR_SAMPLES' };
  }
  const inconsistency = summaryConsistencyCode(avgHr, maxHr, summary);
  if (inconsistency) {
    return { ok: false, code: inconsistency };
  }

  const raw = liveHrSamplesToRawStreams(parsedRows.samples, durationSec);
  return {
    ok: true,
    avgHr: summary.avgHr,
    maxHr: summary.maxHr,
    source: dominantSource(parsedRows.samples),
    raw,
    sampleCount: parsedRows.samples.length,
    coverageSec: hrCoverageSec(raw),
  };
}
