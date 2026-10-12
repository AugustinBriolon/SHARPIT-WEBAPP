import { describe, expect, it } from 'vitest';
import {
  isRaceDayReached,
  raceDayKey,
  raceGoalStanding,
  selectRaceMoment,
} from '@sharpit/app/lib/goals/race-moment';

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

describe('raceGoalStanding', () => {
  const goal = { id: 'goal-1', kind: 'RACE', targetDate: race.targetDate, achieved: false };

  it('reads upcoming before the day, raceDay on it', () => {
    expect(raceGoalStanding(goal, [], '2026-10-10').status).toBe('upcoming');
    expect(raceGoalStanding(goal, [], '2026-10-11').status).toBe('raceDay');
  });

  it('is done once the day has come with a linked activity, carrying its time', () => {
    expect(raceGoalStanding(goal, [result], '2026-10-11')).toEqual({
      status: 'done',
      result: { activityId: 'tri-1', durationSec: 8700 },
    });
    expect(raceGoalStanding(goal, [result], '2026-10-12').status).toBe('done');
  });

  it('awaits its result once past without a link, unless validated by hand', () => {
    expect(raceGoalStanding(goal, [], '2026-10-12')).toEqual({
      status: 'awaitingResult',
      result: null,
    });
    expect(raceGoalStanding({ ...goal, achieved: true }, [], '2026-10-12').status).toBe('done');
  });

  it('keeps a session linked ahead of the race upcoming, and says nothing for a figure goal', () => {
    expect(raceGoalStanding(goal, [result], '2026-10-01').status).toBe('upcoming');
    expect(raceGoalStanding({ ...goal, kind: 'METRIC' }, [], '2026-10-12')).toEqual({
      status: null,
      result: null,
    });
  });
});

describe('isRaceDayReached', () => {
  it('holds from the race day on, and always for an undated race', () => {
    expect(isRaceDayReached(race.targetDate, '2026-10-10')).toBe(false);
    expect(isRaceDayReached(race.targetDate, '2026-10-11')).toBe(true);
    expect(isRaceDayReached(null, '2026-10-01')).toBe(true);
  });
});
