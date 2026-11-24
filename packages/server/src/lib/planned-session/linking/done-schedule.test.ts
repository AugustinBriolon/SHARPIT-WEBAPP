import { describe, expect, it } from 'vitest';
import { doneScheduleOf, schedulePatchForDoneSession } from './done-schedule';

const PARIS = 'Europe/Paris';

describe('doneScheduleOf', () => {
  it('reads the day and the time on the athlete’s clock', () => {
    const done = doneScheduleOf(new Date('2026-11-22T16:40:00Z'), PARIS);
    expect(done.date.toISOString()).toBe('2026-11-22T00:00:00.000Z');
    expect(done.startTime).toBe('17:40');
  });

  it('puts a late evening on the local day, not the UTC one', () => {
    const done = doneScheduleOf(new Date('2026-11-22T23:30:00Z'), PARIS);
    expect(done.date.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(done.startTime).toBe('00:30');
  });

  it('gives no time to an activity logged with a day only', () => {
    expect(doneScheduleOf(new Date('2026-11-22T12:00:00Z'), PARIS).startTime).toBeNull();
    expect(doneScheduleOf(new Date('2026-11-22T00:00:00Z'), PARIS)).toEqual({
      date: new Date('2026-11-22T00:00:00Z'),
      startTime: null,
    });
  });
});

describe('schedulePatchForDoneSession', () => {
  const monday = { date: new Date('2026-11-23T00:00:00Z'), startTime: '18:00' };

  it('moves a session done the day before to that day and time', () => {
    const done = doneScheduleOf(new Date('2026-11-22T16:40:00Z'), PARIS);
    expect(schedulePatchForDoneSession(monday, done)).toEqual({
      date: new Date('2026-11-22T00:00:00Z'),
      startTime: '17:40',
    });
  });

  it('keeps the day and takes the time when done on the planned day', () => {
    const done = doneScheduleOf(new Date('2026-11-23T06:15:00Z'), PARIS);
    expect(schedulePatchForDoneSession(monday, done)).toEqual({ startTime: '07:15' });
  });

  it('clears the planned slot when the day moved and the activity has no time', () => {
    const done = doneScheduleOf(new Date('2026-11-22T12:00:00Z'), PARIS);
    expect(schedulePatchForDoneSession(monday, done)).toEqual({
      date: new Date('2026-11-22T00:00:00Z'),
      startTime: null,
    });
  });

  it('changes nothing for a day-only activity on the planned day', () => {
    const done = doneScheduleOf(new Date('2026-11-23T12:00:00Z'), PARIS);
    expect(schedulePatchForDoneSession(monday, done)).toEqual({});
  });
});
