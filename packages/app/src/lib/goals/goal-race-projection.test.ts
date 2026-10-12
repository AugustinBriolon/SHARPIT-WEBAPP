import { describe, expect, it } from 'vitest';
import {
  buildRaceFinishProjection,
  parseRaceTargetSeconds,
  resolveRunRaceMeters,
} from '@sharpit/app/lib/goals/goal-race-projection';
import type { RecordEntry, RunBestCategory } from '@sharpit/app/lib/training/records/record-types';

function entry(value: number): RecordEntry {
  return {
    rank: 1,
    value,
    displayValue: '',
    sublabel: null,
    activityId: null,
    date: '2026-01-01',
    title: null,
  };
}

function runBest(meters: number, seconds: number, label: string): RunBestCategory {
  return { meters, label, entries: [entry(seconds)] };
}

describe('resolveRunRaceMeters', () => {
  it('maps common run formats', () => {
    expect(resolveRunRaceMeters('10 km', null)).toBe(10000);
    expect(resolveRunRaceMeters('Semi', null)).toBe(21097);
    expect(resolveRunRaceMeters('Marathon de Paris', null)).toBe(42195);
    expect(resolveRunRaceMeters(null, '5K Boulogne')).toBe(5000);
  });

  it('rejects multisport formats', () => {
    expect(resolveRunRaceMeters('Half Ironman', null)).toBeNull();
    expect(resolveRunRaceMeters('70.3', 'Versailles')).toBeNull();
    expect(resolveRunRaceMeters('Ironman', null)).toBeNull();
  });
});

describe('parseRaceTargetSeconds', () => {
  it('parses chrono and Sub/Sous hour forms', () => {
    expect(parseRaceTargetSeconds('1:30:00')).toBe(5400);
    expect(parseRaceTargetSeconds('Sub 1h30')).toBe(5400);
    expect(parseRaceTargetSeconds('Sous 6h')).toBe(21600);
    expect(parseRaceTargetSeconds('Sub 5h00')).toBe(18000);
    expect(parseRaceTargetSeconds('42:15')).toBe(2535);
    expect(parseRaceTargetSeconds('Sub 5h30')).toBe(19800);
    expect(parseRaceTargetSeconds('5:28:00')).toBe(19680);
    expect(parseRaceTargetSeconds("5h28'30")).toBe(19710);
    expect(parseRaceTargetSeconds('50 min')).toBe(3000);
    expect(parseRaceTargetSeconds('Terminer')).toBeNull();
  });
});

describe('buildRaceFinishProjection', () => {
  it('projects a 10k finish vs Sub target from Riegel', () => {
    const projection = buildRaceFinishProjection({
      raceFormat: '10 km',
      title: '10 km Boulogne',
      targetPerformance: 'Sub 45:00',
      runBests: [runBest(10000, 2400, '10 km')],
    });

    expect(projection).not.toBeNull();
    expect(projection?.source).toBe('riegel');
    expect(projection?.projectedFinishLabel).toMatch(/40:/);
    expect(projection?.projectedGapLabel).toMatch(/sous la cible/);
  });

  it('returns null for Half Ironman without swim/bike evidence', () => {
    expect(
      buildRaceFinishProjection({
        raceFormat: 'Half Ironman',
        title: 'Half IronMan Versailles',
        targetPerformance: 'Sub 6h',
        runBests: [runBest(10000, 2400, '10 km')],
      }),
    ).toBeNull();
  });

  it('projects Half Ironman from CSS + FTP + run bests', () => {
    const projection = buildRaceFinishProjection({
      raceFormat: 'Half Ironman',
      title: 'Half IronMan Versailles',
      targetPerformance: 'Sub 6h',
      runBests: [runBest(10000, 2400, '10 km')],
      swimCssSecPer100m: 100,
      ftpW: 240,
      weightKg: 75,
      activities: [
        {
          id: 't1',
          type: 'TRIATHLON',
          date: '2026-01-01',
          duration: 20_000,
          multisportLegs: [
            {
              kind: 'bike',
              label: 'Vélo',
              durationSec: 7200,
              movingDurationSec: 7200,
              distanceM: 70_000,
              avgHr: null,
              avgSpeedMs: null,
              elevationM: null,
              calories: null,
              garminActivityId: null,
              transitionIndex: null,
            },
          ],
        },
      ],
      sessions: [],
    });

    expect(projection?.source).toBe('triathlon');
    expect(projection?.projectedFinishLabel).toMatch(/:/);
    expect(projection?.legs).toHaveLength(5);
    expect(projection?.legs.map((leg) => leg.kind)).toEqual(['swim', 't1', 'bike', 't2', 'run']);
    expect(projection?.projectedGapLabel).toMatch(/cible/);
  });

  it('returns null without run references', () => {
    expect(
      buildRaceFinishProjection({
        raceFormat: 'Semi',
        title: 'Semi Paris',
        targetPerformance: '1:30:00',
        runBests: [],
      }),
    ).toBeNull();
  });
});
