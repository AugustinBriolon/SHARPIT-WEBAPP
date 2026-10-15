import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';

/** `YYYY-MM-DD` from a local calendar day. */
export function toDayId(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Parse `YYYY-MM-DD` as local noon (avoids DST edge flips). */
export function fromDayId(dayId: string): Date {
  return parseISO(`${dayId}T12:00:00`);
}

/** Compact trigger label — `16/10/2026`. */
export function formatDayTrigger(dayId: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayId)) {
    return dayId;
  }
  return format(fromDayId(dayId), 'dd/MM/yyyy');
}

/** `HH:mm` or empty. */
export function formatTimeTrigger(time: string): string {
  return /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : time || '—';
}

export function parseTimeParts(time: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return { hour: 12, minute: 0 };
  }
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

export function formatTimeParts(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Minutes snapped to 5 — training sessions rarely need 1-minute precision. */
export function snapMinute(minute: number): number {
  return Math.min(55, Math.round(minute / 5) * 5);
}

export const TIME_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const TIME_MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

export type CalendarDay = {
  date: Date;
  dayId: string;
  label: string;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
};

/** Six-week grid for one visible month, Monday-first. */
export function calendarDays(viewMonth: Date, selectedDayId: string): CalendarDay[] {
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(selectedDayId) ? fromDayId(selectedDayId) : null;
  const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end }).map((date) => ({
    date,
    dayId: toDayId(date),
    label: format(date, 'd'),
    inMonth: isSameMonth(date, viewMonth),
    today: isToday(date),
    selected: selected ? isSameDay(date, selected) : false,
  }));
}

export function monthTitle(viewMonth: Date): string {
  return format(viewMonth, 'MMMM yyyy', { locale: fr });
}

export function shiftMonth(viewMonth: Date, delta: number): Date {
  return addMonths(viewMonth, delta);
}

export const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;
