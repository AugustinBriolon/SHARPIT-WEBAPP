import type { ActivityType } from '@prisma/client';
import type { ActivityAnalysis } from '@sharpit/app/lib/activity/detail/activity-analysis';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';

/** Activity stream shapes, as the web reads them (built by `@sharpit/server/lib/streams`). */

export interface StreamSample {
  t: number; // temps (s)
  d: number; // distance cumulée (m)
  alt: number | null;
  hr: number | null;
  watts: number | null;
  cadence: number | null;
  speed: number | null; // m/s
}

export interface ActivityStreamPayload {
  available: boolean;
  path: [number, number][] | null;
  samples: StreamSample[];
  has: {
    distance: boolean;
    altitude: boolean;
    hr: boolean;
    watts: boolean;
    cadence: boolean;
    speed: boolean;
  };
  stats: {
    avgHr: number | null;
    maxHr: number | null;
    avgWatts: number | null;
    maxWatts: number | null;
    avgCadence: number | null;
    maxSpeed: number | null; // m/s
    avgSpeed: number | null; // m/s
    totalDistance: number | null; // m
    totalAscent: number | null; // m
    minAlt: number | null;
    maxAlt: number | null;
  } | null;
  analysis: ActivityAnalysis | null;
  /**
   * Present when the iOS app recorded live HR during a strength session.
   * `ble` → show « FC captée en direct » on the activity detail.
   */
  liveHr?: { source: 'watch' | 'ble' } | null;
}

export interface MultisportLegStream {
  leg: MultisportLeg;
  type: ActivityType;
  stream: ActivityStreamPayload;
}

export interface MultisportStreamsPayload {
  legs: MultisportLegStream[];
}

/** Activity id → simplified route (lat/lng), for list thumbnails. */
export type ActivityRoutePreviews = Record<string, [number, number][]>;
