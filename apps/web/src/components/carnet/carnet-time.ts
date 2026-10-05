import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';

const WEEK = { weekStartsOn: 1 as const };

/** A training day id (`YYYY-MM-DD`) as the noon of that day, away from both DST edges. */
export function dayOf(trainingDayId: string): Date {
  return parseISO(`${trainingDayId}T12:00:00`);
}

export function dayIdOf(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** `?jour=` when it is a valid day id, else today. */
export function resolveDayParam(value: string | string[] | undefined, today: string): string {
  const day = Array.isArray(value) ? value[0] : value;
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today ? day : today;
}

/** « lundi 5 octobre » */
export function longDayLabel(trainingDayId: string): string {
  return format(dayOf(trainingDayId), 'EEEE d MMMM', { locale: fr });
}

/** The Mondays of the `count` weeks ending with the week holding `day`, oldest first. */
export function weekStartsEndingAt(day: Date, count: number): Date[] {
  const last = startOfWeek(day, WEEK);
  return Array.from({ length: count }, (_, index) => addWeeks(last, index - count + 1));
}

/** « 29 sept. – 5 oct. » */
export function weekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  return sameMonth
    ? `${format(monday, 'd', { locale: fr })} – ${format(sunday, 'd MMM', { locale: fr })}`
    : `${format(monday, 'd MMM', { locale: fr })} – ${format(sunday, 'd MMM', { locale: fr })}`;
}

/** « dans 12 jours », « demain », « aujourd'hui », « il y a 3 jours » */
export function countdownLabel(target: Date, today: Date): string {
  const days = differenceInCalendarDays(target, today);
  if (days === 0) {
    return "aujourd'hui";
  }
  if (days === 1) {
    return 'demain';
  }
  if (days > 1) {
    return days >= 70 ? `dans ${Math.round(days / 7)} semaines` : `dans ${days} jours`;
  }
  return days === -1 ? 'hier' : `il y a ${-days} jours`;
}

/** « octobre 2026 » — the heading a month of sessions sits under. */
export function monthLabel(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: fr });
}

/**
 * The view models still carry the old web's hrefs. In the carnet, a session points at its
 * page here and anything else (an action, a setting) has no page to go to.
 */
export function carnetHref(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }
  const [path = ''] = href.split(/[?#]/);
  const activity = /^\/activite\/([^/]+)$/.exec(path);
  if (activity && activity[1] !== 'nouvelle' && activity[1] !== 'sejours') {
    return `/carnet/seances/${activity[1]}`;
  }
  return READING_PAGES[path] ?? null;
}

const READING_PAGES: Record<string, string> = {
  '/today/sleep': '/carnet/corps',
  '/today/recovery': '/carnet/corps',
  '/moi/corps': '/carnet/corps',
  '/plan/charge': '/carnet/saison',
  '/plan/adaptation': '/carnet/saison',
  '/plan/bilan': '/carnet/bilans',
  '/moi/performance': '/carnet/records',
  '/moi/objectifs': '/carnet/saison',
  '/nutrition': '/carnet/nutrition',
};
