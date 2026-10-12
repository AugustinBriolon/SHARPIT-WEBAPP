import { describe, expect, it } from 'vitest';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import type { ActivityStreamPayload } from '@sharpit/app/lib/streams/stream-types';
import { buildRaceAnalysis } from '@sharpit/server/lib/activity/multisport/race-analysis';

function leg(kind: MultisportLeg['kind'], durationSec: number, extra: Partial<MultisportLeg> = {}) {
  return {
    kind,
    label: kind,
    durationSec,
    movingDurationSec: null,
    distanceM: null,
    avgHr: null,
    avgSpeedMs: null,
    elevationM: null,
    calories: null,
    garminActivityId: null,
    transitionIndex: null,
    ...extra,
  } satisfies MultisportLeg;
}

/** Evenly sampled stream: `firstSpeed` m/s for the first half, `secondSpeed` after. */
function stream(
  durationSec: number,
  firstSpeed: number,
  secondSpeed: number,
  analysis: { zones?: number[]; decouplingPct?: number | null } = {},
): ActivityStreamPayload {
  const samples = [];
  let d = 0;
  for (let t = 0; t <= durationSec; t += 60) {
    samples.push({ t, d, alt: null, hr: 150, watts: null, cadence: null, speed: null });
    d += (t < durationSec / 2 ? firstSpeed : secondSpeed) * 60;
  }
  return {
    available: true,
    path: null,
    samples,
    has: { distance: true, altitude: false, hr: true, watts: false, cadence: false, speed: false },
    stats: null,
    analysis: {
      hr: {
        zones: (analysis.zones ?? []).map((seconds, i) => ({
          id: `z${i + 1}`,
          label: '',
          shortLabel: '',
          color: '',
          seconds,
          percent: 0,
        })),
        decouplingPct: analysis.decouplingPct ?? null,
      },
    } as unknown as ActivityStreamPayload['analysis'],
  };
}

describe('buildRaceAnalysis', () => {
  const legs = [
    {
      leg: leg('swim', 1800, { distanceM: 1900, sourceActivityId: 'a-swim' }),
      stream: stream(1800, 1, 1.05),
    },
    { leg: leg('transition', 300, { transitionIndex: 1 }), stream: null },
    {
      leg: leg('bike', 10800, { distanceM: 90_000, avgHr: 141.6 }),
      stream: stream(10800, 25 / 3.6, 20 / 3.6, { zones: [600, 3600, 5400, 1200, 0] }),
    },
    { leg: leg('transition', 200, { transitionIndex: 2 }), stream: null },
    {
      leg: leg('run', 6000, { distanceM: 21_100 }),
      stream: stream(6000, 1000 / 270, 1000 / 300, { decouplingPct: 6.24 }),
    },
  ];

  it('reads the total against the parsed target', () => {
    const analysis = buildRaceAnalysis({
      durationSec: 19100,
      load: 310,
      targetPerformance: 'Sub 5h30',
      legs,
    });
    expect(analysis.target).toEqual({ label: 'Sub 5h30', seconds: 19800 });
    expect(analysis.total).toEqual({ seconds: 19100, deltaSec: -700 });
    expect(analysis.load).toEqual({ tss: 310, recoveryHours: null });
    expect(analysis.runHrDriftPct).toBe(6.2);
  });

  it('labels legs, keeps their rows and reads zones', () => {
    const analysis = buildRaceAnalysis({
      durationSec: 19100,
      load: null,
      targetPerformance: null,
      legs,
    });
    expect(analysis.legs.map((l) => l.label)).toEqual([
      'Natation',
      'T1',
      'Vélo',
      'T2',
      'Course à pied',
    ]);
    expect(analysis.legs[0]!.sourceActivityId).toBe('a-swim');
    expect(analysis.legs[2]).toMatchObject({ avgHr: 142, hrZonesSec: [600, 3600, 5400, 1200, 0] });
    expect(analysis.legs[1]).toMatchObject({ hrZonesSec: null, pacing: null });
    expect(analysis.target).toEqual({ label: null, seconds: null });
    expect(analysis.total.deltaSec).toBeNull();
  });

  it('normalizes pacing so a positive change is always a slowdown', () => {
    const analysis = buildRaceAnalysis({
      durationSec: 19100,
      load: null,
      targetPerformance: null,
      legs,
    });
    const [swim, , bike, , run] = analysis.legs;
    expect(swim!.pacing).toMatchObject({ unit: 'sec_per_100m', firstHalf: 100 });
    expect(swim!.pacing!.changePct).toBeLessThan(0);
    expect(bike!.pacing).toMatchObject({
      unit: 'kmh',
      firstHalf: 25,
      secondHalf: 20,
      changePct: 25,
    });
    expect(run!.pacing).toMatchObject({ unit: 'sec_per_km', firstHalf: 270, secondHalf: 300 });
    expect(run!.pacing!.changePct).toBeCloseTo(11.1, 1);
  });

  it('has no pacing or zones without a stream', () => {
    const analysis = buildRaceAnalysis({
      durationSec: null,
      load: null,
      targetPerformance: 'Terminer',
      legs: [{ leg: leg('run', 3000), stream: null }],
    });
    expect(analysis.total.seconds).toBe(3000);
    expect(analysis.target.seconds).toBeNull();
    expect(analysis.legs[0]).toMatchObject({ pacing: null, hrZonesSec: null });
  });
});
