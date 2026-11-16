import { powerZoneIndex } from '@sharpit/app/lib/activity/detail/activity-analysis';
import type { StreamSample } from '@sharpit/app/lib/streams/stream-types';

export type ProfilePoint = {
  label: string;
  hr: number | null;
  alt: number | null;
  watts: number | null;
};

/**
 * A recording thinned evenly to at most `maxPoints` for a page-wide profile. The axis is the
 * distance when the session covered one, else the time: a run reads by the kilometre, a
 * trainer ride by the minute.
 */
export function streamProfile(samples: readonly StreamSample[], maxPoints = 240): ProfilePoint[] {
  if (samples.length === 0) {
    return [];
  }
  const byDistance = (samples.at(-1)?.d ?? 0) > 0;
  const step = Math.max(1, Math.ceil(samples.length / maxPoints));
  const points: ProfilePoint[] = [];
  for (let index = 0; index < samples.length; index += step) {
    const sample = samples[index];
    if (!sample) {
      continue;
    }
    points.push({
      label: byDistance ? `${(sample.d / 1000).toFixed(1)} km` : `${Math.round(sample.t / 60)} min`,
      hr: sample.hr,
      alt: sample.alt !== null ? Math.round(sample.alt) : null,
      watts: sample.watts,
    });
  }
  return points;
}

export type PowerBar = {
  /** Mean power of the slice. */
  watts: number;
  /** The bar's height against the session's strongest slice, 0 to 1. */
  share: number;
  /** The slice's power zone from 0 (Z1); null without an FTP to read it against. */
  zone: number | null;
};

/**
 * A session's power as at most `maxBars` slices of equal time, each its mean power: blocks and
 * recoveries read as steps, which a line through every sample hides. A slice with no power
 * recorded draws nothing (zero share).
 */
export function powerBars(
  samples: readonly StreamSample[],
  ftp: number | null,
  maxBars = 120,
): PowerBar[] {
  const last = samples.at(-1);
  if (!last || !samples.some((s) => s.watts !== null)) {
    return [];
  }
  const span = Math.max(1, last.t - (samples[0]?.t ?? 0));
  const count = Math.min(maxBars, samples.length);
  const sums = new Array<number>(count).fill(0);
  const hits = new Array<number>(count).fill(0);
  for (const sample of samples) {
    if (sample.watts === null) {
      continue;
    }
    const slot = Math.min(
      count - 1,
      Math.floor(((sample.t - (samples[0]?.t ?? 0)) / span) * count),
    );
    sums[slot] = (sums[slot] ?? 0) + sample.watts;
    hits[slot] = (hits[slot] ?? 0) + 1;
  }
  const means = sums.map((sum, i) => ((hits[i] ?? 0) > 0 ? sum / (hits[i] ?? 1) : 0));
  const peak = Math.max(1, ...means);
  return means.map((watts) => ({
    watts: Math.round(watts),
    share: watts / peak,
    zone: ftp && watts > 0 ? powerZoneIndex(watts, ftp) : null,
  }));
}

/**
 * Heart rate as an SVG polyline in a `width` × `height` box, time left to right, the session's
 * lowest beat on the floor and its highest at the top. Empty without a heart-rate recording.
 */
export function heartRateLine(
  samples: readonly StreamSample[],
  width: number,
  height: number,
  maxPoints = 240,
): string {
  const beats = samples.filter((s): s is StreamSample & { hr: number } => s.hr !== null);
  if (beats.length < 2) {
    return '';
  }
  const start = samples[0]?.t ?? 0;
  const span = Math.max(1, (samples.at(-1)?.t ?? 0) - start);
  const low = Math.min(...beats.map((s) => s.hr));
  const range = Math.max(1, Math.max(...beats.map((s) => s.hr)) - low);
  const step = Math.max(1, Math.ceil(beats.length / maxPoints));
  return beats
    .filter((_, i) => i % step === 0)
    .map((s) => {
      const x = ((s.t - start) / span) * width;
      const y = height - ((s.hr - low) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
