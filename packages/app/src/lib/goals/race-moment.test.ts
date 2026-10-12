import { describe, expect, it } from 'vitest';
import { raceDayKey, selectRaceMoment } from '@sharpit/app/lib/goals/race-moment';

const race = {
  id: 'goal-1',
  kind: 'RACE',
  title: 'Triathlon de Paris',
  raceFormat: 'M',
  targetPerformance: 'Sub 2h30',
  targetDate: new Date('2026-10-11T00:00:00Z'),
};

const legs = [
  {
    kind: 'swim',
    label: 'Natation',
    durationSec: 1800,
    movingDurationSec: null,
    distanceM: 1500,
    avgHr: null,
    avgSpeedMs: null,
    elevationM: null,
    calories: null,
    garminActivityId: null,
    transitionIndex: null,
    sourceActivityId: 'leg-swim',
  },
];

const result = {
  id: 'tri-1',
  title: 'Triathlon de Paris',
  duration: 8700,
  goalId: 'goal-1',
  multisportLegs: legs,
};

describe('selectRaceMoment', () => {
  it('shows race day on the target date, before any result', () => {
    expect(selectRaceMoment([race], [], '2026-10-11')).toEqual({
      goalId: 'goal-1',
      title: 'Triathlon de Paris',
      raceFormat: 'M',
      targetPerformance: 'Sub 2h30',
      targetDate: '2026-10-11',
      phase: 'raceDay',
      activity: null,
    });
  });

  it('carries the linked result once it exists', () => {
    expect(selectRaceMoment([race], [result], '2026-10-11')?.activity).toEqual({
      id: 'tri-1',
      title: 'Triathlon de Paris',
      durationSec: 8700,
      legs,
    });
  });

  it('shows the result for three days after the race, only with a linked activity', () => {
    expect(selectRaceMoment([race], [result], '2026-10-14')?.phase).toBe('postRace');
    expect(selectRaceMoment([race], [result], '2026-10-15')).toBeNull();
    expect(selectRaceMoment([race], [], '2026-10-12')).toBeNull();
  });

  it('ignores metric goals, undated goals and days before the race', () => {
    expect(selectRaceMoment([{ ...race, kind: 'METRIC' }], [], '2026-10-11')).toBeNull();
    expect(selectRaceMoment([{ ...race, targetDate: null }], [], '2026-10-11')).toBeNull();
    expect(selectRaceMoment([race], [], '2026-10-10')).toBeNull();
  });

  it('prefers a race day over the result of an earlier race', () => {
    const earlier = { ...race, id: 'goal-0', targetDate: new Date('2026-10-09T00:00:00Z') };
    const moment = selectRaceMoment(
      [earlier, race],
      [{ ...result, goalId: 'goal-0' }],
      '2026-10-11',
    );
    expect(moment?.goalId).toBe('goal-1');
  });
});

describe('raceDayKey', () => {
  it('reads a bare day and a local midnight with offset as the same race day', () => {
    expect(raceDayKey('2026-10-11T00:00:00.000Z')).toBe('2026-10-11');
    expect(raceDayKey('2026-10-11T00:00:00+02:00')).toBe('2026-10-11');
  });
});
