import { isSet } from '@sharpit/shared/value';

export interface RawStreams {
  time: number[];
  distance: number[];
  altitude: number[];
  heartrate: number[];
  watts: number[];
  cadence: number[];
  velocity: number[];
  latlng: [number, number][];
}

export function rawStreamsHaveSignal(raw: RawStreams): boolean {
  const has = (arr: number[]) => arr.length > 0 && arr.some((v) => isSet(v) && v !== 0);
  return (
    raw.latlng.length > 0 ||
    has(raw.heartrate) ||
    has(raw.watts) ||
    has(raw.altitude) ||
    has(raw.velocity) ||
    has(raw.distance)
  );
}
