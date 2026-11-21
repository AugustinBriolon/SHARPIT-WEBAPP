import { describe, expect, it } from 'vitest';
import { localDayAndMinute, minuteOfClock, minuteOnDay } from './athlete-time-zone';

describe('athlete clock', () => {
  it('reads an instant on the athlete zone, summer and winter', () => {
    expect(localDayAndMinute(new Date('2026-11-21T12:05:00Z'), 'Europe/Paris')).toEqual({
      dayId: '2026-11-21',
      minute: 13 * 60 + 5,
    });
    expect(localDayAndMinute(new Date('2026-07-01T22:30:00Z'), 'Europe/Paris')).toEqual({
      dayId: '2026-07-02',
      minute: 30,
    });
  });

  it('places an instant on its own day only', () => {
    const instant = new Date('2026-11-21T06:40:00Z');
    expect(minuteOnDay(instant, '2026-11-21', 'Europe/Paris')).toBe(7 * 60 + 40);
    expect(minuteOnDay(instant, '2026-11-20', 'Europe/Paris')).toBeNull();
  });

  it('reads a planned start', () => {
    expect(minuteOfClock('18:30')).toBe(18 * 60 + 30);
    expect(minuteOfClock('7:05')).toBe(7 * 60 + 5);
    expect(minuteOfClock(null)).toBeNull();
    expect(minuteOfClock('soir')).toBeNull();
  });
});
