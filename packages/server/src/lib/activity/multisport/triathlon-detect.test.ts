import { describe, expect, it } from 'vitest';
import { ActivityType } from '@prisma/client';
import {
  detectTriathlonChain,
  type DetectableActivity,
} from '@sharpit/server/lib/activity/multisport/triathlon-detect';

const T0 = Date.parse('2026-10-11T08:00:00Z');

function row(
  id: string,
  type: ActivityType,
  startMin: number,
  durationMin: number,
  distanceM: number | null = null,
): DetectableActivity {
  return {
    id,
    type,
    date: new Date(T0 + startMin * 60_000),
    duration: durationMin * 60,
    distanceM,
    avgHr: null,
    garminId: null,
  };
}

/** Strava's five rows of a sprint: swim, T1, bike, T2, run. */
const stravaChain = [
  row('swim', ActivityType.SWIM, 0, 15, 750),
  row('t1', ActivityType.OTHER, 15, 2),
  row('bike', ActivityType.BIKE, 17, 35, 20_000),
  row('t2', ActivityType.STRENGTH, 52, 1),
  row('run', ActivityType.RUN, 53, 22, 5000),
];

describe('detectTriathlonChain', () => {
  it('chains the five Strava rows with their transitions', () => {
    const chain = detectTriathlonChain([...stravaChain].reverse());
    expect(chain?.rows.map((r) => r.id)).toEqual(['swim', 't1', 'bike', 't2', 'run']);
    expect(chain?.legs.map((leg) => leg.label)).toEqual(['Natation', 'T1', 'Vélo', 'T2', 'Course']);
    expect(chain?.legs.map((leg) => leg.sourceActivityId)).toEqual([
      'swim',
      't1',
      'bike',
      't2',
      'run',
    ]);
    expect(chain?.start.toISOString()).toBe('2026-10-11T08:00:00.000Z');
    expect(chain?.durationSec).toBe(75 * 60);
  });

  it('turns plain gaps into transitions when none was recorded', () => {
    const chain = detectTriathlonChain([
      row('swim', ActivityType.SWIM, 0, 15),
      row('bike', ActivityType.BIKE, 18, 35),
      row('run', ActivityType.RUN, 55, 22),
    ]);
    expect(chain?.legs.map((leg) => leg.label)).toEqual(['Natation', 'T1', 'Vélo', 'T2', 'Course']);
    expect(chain?.legs[1]).toMatchObject({ durationSec: 180, sourceActivityId: null });
    expect(chain?.rows).toHaveLength(3);
  });

  it('rejects a gap longer than ten minutes', () => {
    expect(
      detectTriathlonChain([
        row('swim', ActivityType.SWIM, 0, 15),
        row('bike', ActivityType.BIKE, 30, 35),
        row('run', ActivityType.RUN, 66, 22),
      ]),
    ).toBeNull();
  });

  it('ignores a bike → run brick without a swim', () => {
    expect(
      detectTriathlonChain([
        row('bike', ActivityType.BIKE, 0, 60),
        row('run', ActivityType.RUN, 62, 20),
      ]),
    ).toBeNull();
  });

  it('skips another provider’s concurrent copy of a leg', () => {
    const chain = detectTriathlonChain([
      ...stravaChain,
      row('apple-bike', ActivityType.BIKE, 17.2, 34.8, 20_000),
    ]);
    expect(chain?.rows.map((r) => r.id)).toEqual(['swim', 't1', 'bike', 't2', 'run']);
  });
});
