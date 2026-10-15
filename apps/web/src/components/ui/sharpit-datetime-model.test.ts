import { describe, expect, it } from 'vitest';
import {
  calendarDays,
  formatDayTrigger,
  formatTimeParts,
  formatTimeTrigger,
  parseTimeParts,
  snapMinute,
  toDayId,
} from './sharpit-datetime-model';

describe('sharpit-datetime-model', () => {
  it('formats day and time triggers for the field chrome', () => {
    expect(formatDayTrigger('2026-10-16')).toBe('16/10/2026');
    expect(formatTimeTrigger('12:30')).toBe('12:30');
    expect(formatTimeTrigger('9:05')).toBe('09:05');
    expect(formatTimeTrigger('')).toBe('—');
  });

  it('parses and snaps clock parts for the wheel', () => {
    expect(parseTimeParts('12:30')).toEqual({ hour: 12, minute: 30 });
    expect(parseTimeParts('')).toEqual({ hour: 12, minute: 0 });
    expect(snapMinute(32)).toBe(30);
    expect(snapMinute(33)).toBe(35);
    expect(formatTimeParts(7, 5)).toBe('07:05');
  });

  it('builds a Monday-first month grid with the selected day marked', () => {
    const days = calendarDays(new Date(2026, 9, 1), '2026-10-16');
    expect(days.length % 7).toBe(0);
    expect(days[0]?.date.getDay()).toBe(1);
    expect(days.find((day) => day.dayId === '2026-10-16')?.selected).toBe(true);
    expect(toDayId(new Date(2026, 9, 16))).toBe('2026-10-16');
  });
});
