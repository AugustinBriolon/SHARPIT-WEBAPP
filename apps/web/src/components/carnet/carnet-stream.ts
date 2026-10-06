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
