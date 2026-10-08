import type { PlannedSession } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import { prisma } from '@sharpit/db/client';
import {
  forgetCalendarIds,
  readableCalendarIds,
} from '@sharpit/server/lib/integrations/google/calendar-ids-cache';
import {
  createEvent,
  deleteEvent,
  getFreeBusy,
  GoogleOAuthError,
  listCalendars,
  listEvents,
  refreshAccessToken,
  updateEvent,
  type BusyInterval,
} from '@sharpit/server/lib/integrations/google/google';

import {
  googleCalendarGateFromPrefs,
  shouldSyncGoogleCalendarFreeBusy,
  shouldSyncGoogleCalendarWrites,
} from '@sharpit/server/lib/cron/provider-sync-gates';
import { loadAppleCalendarBusy } from '@sharpit/server/lib/integrations/apple-calendar/calendar-busy-snapshot';
import { mergeBusyIntervals } from '@sharpit/server/lib/integrations/google/merge-busy-intervals';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import { syncSinceFromLastSync } from '@sharpit/server/lib/integrations/shared/sync-since';
import {
  isDecryptMalformedSoftFailure,
  isOAuthAccountConnected,
  ProviderAuthError,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  isSecretAuthenticityFailure,
  isSecretDecryptFailure,
} from '@sharpit/server/lib/secret-box';

const DAY_START_MIN = 6 * 60; // 06:00
const DAY_END_MIN = 21 * 60; // 21:00
const DEFAULT_DURATION_MIN = 60;
const SLOT_STEP_MIN = 15;

const TYPE_LABELS: Record<string, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
  STRENGTH: 'Renfo',
};

export async function getGoogleAccount(athleteId: string) {
  return prisma.googleAccount.findUnique({ where: { athleteId } });
}

async function athleteMayWriteGoogleCalendar(athleteId: string): Promise<boolean> {
  const [account, prefs] = await Promise.all([
    getGoogleAccount(athleteId),
    loadResolvedSourcePrefs(athleteId),
  ]);
  const calendarGate = googleCalendarGateFromPrefs(prefs);
  return shouldSyncGoogleCalendarWrites({
    connected: isOAuthAccountConnected(account) && Boolean(account?.targetCalendarId),
    targetCalendarId: account?.targetCalendarId,
    ...calendarGate,
  });
}

/** Both OAuth blobs must look like live ciphertext — same bar as Strava/Withings. */
export function isGoogleConnected(
  account:
    | {
        accessTokenEnc?: string | null;
        refreshTokenEnc?: string | null;
      }
    | null
    | undefined,
): boolean {
  return isOAuthAccountConnected(account);
}

/** Invalide les jetons OAuth tout en conservant le calendrier cible et les préférences. */
export async function revokeGoogleCredentials(athleteId: string) {
  const account = await getGoogleAccount(athleteId);
  if (!account) {
    return;
  }
  await forgetCalendarIds(athleteId);
  await prisma.googleAccount.update({
    where: { athleteId },
    data: {
      accessTokenEnc: '',
      refreshTokenEnc: '',
      expiresAt: new Date(0),
    },
  });
}

export async function disconnectGoogle(athleteId: string) {
  await forgetCalendarIds(athleteId);
  await prisma.googleAccount.deleteMany({ where: { athleteId } });
  // On délie les séances : les events Google restent, mais l'app oublie le lien.
  await prisma.plannedSession.updateMany({
    where: { athleteId, googleEventId: { not: null } },
    data: { googleEventId: null },
  });
}

export async function setTargetCalendar(
  athleteId: string,
  calendarId: string | null,
  calendarName: string | null,
) {
  return prisma.googleAccount.update({
    where: { athleteId },
    data: { targetCalendarId: calendarId, targetCalendarName: calendarName },
  });
}

export async function setHiddenCalendars(athleteId: string, ids: string[]) {
  const account = await getGoogleAccount(athleteId);
  if (!account) {
    throw new Error('Compte Google non connecté');
  }
  return prisma.googleAccount.update({
    where: { athleteId },
    data: { hiddenCalendarIds: ids },
  });
}

async function refreshGoogleAccessToken(
  athleteId: string,
  refreshTokenEnc: string,
): Promise<string> {
  try {
    const refreshed = await refreshAccessToken(decryptSecret(refreshTokenEnc));
    await prisma.googleAccount.update({
      where: { athleteId },
      data: {
        accessTokenEnc: encryptSecret(refreshed.access_token),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        ...(refreshed.refresh_token
          ? { refreshTokenEnc: encryptSecret(refreshed.refresh_token) }
          : {}),
      },
    });
    return refreshed.access_token;
  } catch (error) {
    if (isSecretAuthenticityFailure(error)) {
      throw error;
    }
    if (
      (error instanceof GoogleOAuthError && error.needsReconnect) ||
      isDecryptMalformedSoftFailure(error)
    ) {
      await revokeGoogleCredentials(athleteId);
      throw new ProviderAuthError(
        'Session Google expirée. Reconnecte Google dans les paramètres.',
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}

export async function getValidAccessToken(athleteId: string) {
  return validAccessTokenFor(athleteId, await getGoogleAccount(athleteId));
}

/** The same token, from an account row the caller already read. */
async function validAccessTokenFor(
  athleteId: string,
  account: Awaited<ReturnType<typeof getGoogleAccount>>,
) {
  if (!account || !isEncryptedSecret(account.refreshTokenEnc)) {
    throw new ProviderAuthError('Session Google expirée. Reconnecte Google dans les paramètres.');
  }

  const expiresSoon = account.expiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon && isEncryptedSecret(account.accessTokenEnc)) {
    try {
      return decryptSecret(account.accessTokenEnc);
    } catch (error) {
      if (!isSecretDecryptFailure(error)) {
        throw error;
      }
    }
  }

  return refreshGoogleAccessToken(athleteId, account.refreshTokenEnc);
}

export async function listGoogleCalendars(athleteId: string) {
  const token = await getValidAccessToken(athleteId);
  return listCalendars(token);
}

// ---- Outils de date / fuseau ----

/** Composantes (jour local + minutes) d'un instant dans un fuseau donné. */
function zonedDayAndMinutes(instant: Date, timeZone: string): { dayKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const dayKey = `${get('year')}-${get('month')}-${get('day')}`;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { dayKey, minutes };
}

function minutesToHHmm(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Cherche le premier créneau libre du jour (≥ durationMin), entre 06:00 et 21:00,
 * en évitant les intervalles occupés Google. Renvoie "HH:mm" ou null si rien.
 */
export function findFreeSlot(
  dayKey: string,
  durationMin: number,
  busy: BusyInterval[],
  timeZone: string,
): string | null {
  // Intervalles occupés (en minutes locales) sur ce jour précis.
  const intervals: Array<[number, number]> = [];
  for (const b of busy) {
    const start = zonedDayAndMinutes(new Date(b.start), timeZone);
    const end = zonedDayAndMinutes(new Date(b.end), timeZone);
    if (start.dayKey !== dayKey && end.dayKey !== dayKey) {
      continue;
    }
    const s = start.dayKey === dayKey ? start.minutes : 0;
    const e = end.dayKey === dayKey ? end.minutes : 24 * 60;
    intervals.push([s, e]);
  }
  intervals.sort((a, b) => a[0] - b[0]);

  const overlaps = (s: number, e: number) => intervals.some(([bs, be]) => s < be && e > bs);

  for (let start = DAY_START_MIN; start + durationMin <= DAY_END_MIN; start += SLOT_STEP_MIN) {
    if (!overlaps(start, start + durationMin)) {
      return minutesToHHmm(start);
    }
  }
  return null;
}

// ---- Synchro App → Google ----

interface PushResult {
  synced: boolean;
  reason?: string;
  eventId?: string;
  startTime?: string;
  htmlLink?: string;
}

async function resolvePushStartTime(input: {
  athleteId: string;
  token: string;
  account: NonNullable<Awaited<ReturnType<typeof getGoogleAccount>>>;
  session: PlannedSession;
  dayKey: string;
  duration: number;
}): Promise<string> {
  if (input.session.startTime) {
    return input.session.startTime;
  }
  const start = new Date(`${input.dayKey}T00:00:00Z`);
  const end = new Date(`${input.dayKey}T23:59:59Z`);
  let calendarIds: string[] = [];
  try {
    const calendars = await listCalendars(input.token);
    calendarIds = calendars.map((c) => c.id);
  } catch {
    calendarIds = [input.account.targetCalendarId!];
  }
  const googleBusy = await getFreeBusy(input.token, start, end, calendarIds);
  const prefs = await loadResolvedSourcePrefs(input.athleteId);
  const calendarGate = googleCalendarGateFromPrefs(prefs);
  const appleBusy = calendarGate.calendarEnabled.includes('apple-calendar')
    ? (await loadAppleCalendarBusy(input.athleteId)).filter((b) => {
        const s = new Date(b.start);
        const e = new Date(b.end);
        return e > start && s < end;
      })
    : [];
  const busy = mergeBusyIntervals([...googleBusy, ...appleBusy]);
  return findFreeSlot(input.dayKey, input.duration, busy, input.account.timeZone) ?? '07:00';
}

function buildGoogleEventInput(input: {
  session: PlannedSession;
  dayKey: string;
  startTime: string;
  duration: number;
  timeZone: string;
}) {
  const startMin = Number(input.startTime.slice(0, 2)) * 60 + Number(input.startTime.slice(3, 5));
  const endMin = startMin + input.duration;
  return {
    summary: `[${TYPE_LABELS[input.session.type] ?? input.session.type}] ${input.session.title ?? 'Séance'}`,
    description: input.session.description,
    startDateTime: `${input.dayKey}T${minutesToHHmm(startMin)}:00`,
    endDateTime: `${input.dayKey}T${minutesToHHmm(Math.min(endMin, 24 * 60 - 1))}:00`,
    timeZone: input.timeZone,
  };
}

/**
 * Crée (ou met à jour) l'événement Google correspondant à une séance planifiée
 * dans le calendrier cible. Choisit automatiquement un créneau libre si l'heure
 * n'est pas déjà fixée. Met à jour la séance en base (googleEventId, startTime).
 */
export async function pushSessionToGoogle(session: PlannedSession): Promise<PushResult> {
  const { athleteId } = session;
  const account = await getGoogleAccount(athleteId);
  if (!account) {
    return { synced: false, reason: 'not_connected' };
  }
  if (!account.targetCalendarId) {
    return { synced: false, reason: 'no_target_calendar' };
  }
  if (!(await athleteMayWriteGoogleCalendar(athleteId))) {
    return { synced: false, reason: 'not_calendar_primary' };
  }

  const token = await getValidAccessToken(athleteId);
  const { timeZone } = account;
  const duration = session.durationMin ?? DEFAULT_DURATION_MIN;
  const dayKey = dayKeyFromDate(session.date);
  const startTime = await resolvePushStartTime({
    athleteId,
    token,
    account,
    session,
    dayKey,
    duration,
  });
  const input = buildGoogleEventInput({ session, dayKey, startTime, duration, timeZone });

  const event = session.googleEventId
    ? await updateEvent(token, account.targetCalendarId, session.googleEventId, input)
    : await createEvent(token, account.targetCalendarId, input);

  await prisma.plannedSession.update({
    where: { id: session.id },
    data: { googleEventId: event.id, startTime },
  });

  return {
    synced: true,
    eventId: event.id,
    startTime,
    htmlLink: event.htmlLink,
  };
}

/** Push Google en arrière-plan (ne bloque pas l'outil coach ni l'API). */
export function pushSessionToGoogleInBackground(session: PlannedSession): void {
  void pushSessionToGoogle(session).catch((error) => {
    console.error('Push Google Calendar échoué', error);
  });
}

/**
 * Les jambes d'un brick partent l'une après l'autre, jamais en parallèle.
 * Lancées ensemble, chaque recherche de créneau libre interroge Google avant que
 * l'event de la jambe précédente existe : toutes retombent sur le même créneau,
 * c'est-à-dire exactement le chevauchement qu'un brick ne doit pas produire.
 */
export function pushBrickToGoogleInBackground(sessions: readonly PlannedSession[]): void {
  const ordered = [...sessions].sort((a, b) => (a.brickOrder ?? 0) - (b.brickOrder ?? 0));
  void (async () => {
    for (const session of ordered) {
      try {
        await pushSessionToGoogle(session);
      } catch (error) {
        console.error('Push Google Calendar échoué', error);
      }
    }
  })();
}

export async function deleteSessionFromGoogle(
  session: Pick<PlannedSession, 'athleteId' | 'googleEventId'>,
): Promise<void> {
  if (!session.googleEventId) {
    return;
  }
  const account = await getGoogleAccount(session.athleteId);
  if (!account?.targetCalendarId) {
    return;
  }
  if (!(await athleteMayWriteGoogleCalendar(session.athleteId))) {
    return;
  }
  const token = await getValidAccessToken(session.athleteId);
  await deleteEvent(token, account.targetCalendarId, session.googleEventId);
}

// ---- Synchro Google → App (pull manuel) ----

export interface GooglePullResult {
  pushed: number;
  updated: number;
  unlinked: number;
}

/**
 * Synchronisation complète App ↔ Google :
 * 1. Pousse vers Google les séances futures pas encore liées (création des events).
 * 2. Récupère les modifications faites côté Google sur les séances liées :
 *    - événement déplacé → met à jour date + heure de la séance
 *    - événement supprimé → délie la séance (googleEventId = null)
 */
async function unlinkGoogleSession(sessionId: string): Promise<void> {
  await prisma.plannedSession.update({
    where: { id: sessionId },
    data: { googleEventId: null },
  });
}

function googleEventScheduleTimes(
  session: PlannedSession,
  event: NonNullable<Awaited<ReturnType<typeof listEvents>>[number]>,
  timeZone: string,
) {
  const startIso = event.start?.dateTime ?? event.start?.date;
  if (!startIso) {
    return null;
  }
  const startInstant = new Date(startIso);
  const { dayKey, minutes } = zonedDayAndMinutes(startInstant, timeZone);
  return {
    dayKey,
    newDate: new Date(`${dayKey}T12:00:00Z`),
    newStartTime: event.start?.dateTime ? minutesToHHmm(minutes) : null,
  };
}

function googleSessionSchedulePatch(input: {
  session: PlannedSession;
  event: NonNullable<Awaited<ReturnType<typeof listEvents>>[number]>;
  timeZone: string;
}): { date?: Date; startTime: string | null } | null {
  const schedule = googleEventScheduleTimes(input.session, input.event, input.timeZone);
  if (!schedule) {
    return null;
  }
  const dateChanged = dayKeyFromDate(input.session.date) !== schedule.dayKey;
  const timeChanged = input.session.startTime !== schedule.newStartTime;
  if (!dateChanged && !timeChanged) {
    return null;
  }
  return {
    ...(dateChanged ? { date: schedule.newDate } : {}),
    startTime: schedule.newStartTime,
  };
}

async function applyGoogleEventToSession(input: {
  session: PlannedSession;
  event: Awaited<ReturnType<typeof listEvents>>[number] | undefined;
  timeZone: string;
}): Promise<'updated' | 'unlinked' | 'unchanged'> {
  if (!input.session.googleEventId) {
    return 'unchanged';
  }
  const { event } = input;
  if (!event || event.status === 'cancelled') {
    await unlinkGoogleSession(input.session.id);
    return 'unlinked';
  }
  const patch = googleSessionSchedulePatch({
    session: input.session,
    event,
    timeZone: input.timeZone,
  });
  if (!patch) {
    return 'unchanged';
  }
  await prisma.plannedSession.update({
    where: { id: input.session.id },
    data: patch,
  });
  return 'updated';
}

async function pullGoogleUpdatesOntoSessions(input: {
  athleteId: string;
  token: string;
  calendarId: string;
  timeZone: string;
  from: Date;
  to: Date;
}): Promise<{ updated: number; unlinked: number }> {
  const [events, sessions] = await Promise.all([
    listEvents(input.token, input.calendarId, input.from, input.to),
    prisma.plannedSession.findMany({
      where: { athleteId: input.athleteId, googleEventId: { not: null } },
    }),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  let updated = 0;
  let unlinked = 0;
  for (const session of sessions) {
    const outcome = await applyGoogleEventToSession({
      session,
      event: eventById.get(session.googleEventId ?? ''),
      timeZone: input.timeZone,
    });
    if (outcome === 'updated') {
      updated += 1;
    } else if (outcome === 'unlinked') {
      unlinked += 1;
    }
  }
  return { updated, unlinked };
}

export async function syncFromGoogle(athleteId: string): Promise<GooglePullResult> {
  const account = await getGoogleAccount(athleteId);
  if (!account?.targetCalendarId) {
    throw new Error('Aucun calendrier cible sélectionné');
  }
  if (!(await athleteMayWriteGoogleCalendar(athleteId))) {
    return { pushed: 0, updated: 0, unlinked: 0 };
  }
  const token = await getValidAccessToken(athleteId);
  const now = new Date();
  const from = syncSinceFromLastSync(account.lastSyncAt, 7);
  const to = new Date(now.getTime() + 90 * 86400_000);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const unsynced = await prisma.plannedSession.findMany({
    where: { athleteId, googleEventId: null, date: { gte: todayStart } },
  });
  const pushed = await pushUnsyncedSessionsToGoogle(unsynced);
  const { updated, unlinked } = await pullGoogleUpdatesOntoSessions({
    athleteId,
    token,
    calendarId: account.targetCalendarId,
    timeZone: account.timeZone,
    from,
    to,
  });

  await prisma.googleAccount.update({
    where: { athleteId },
    data: { lastSyncAt: new Date() },
  });

  return { pushed, updated, unlinked };
}

export interface CalendarEventView {
  id: string;
  calendarId: string;
  calendarName: string;
  color: string | null;
  summary: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
}

/**
 * Récupère les événements de TOUS les calendriers Google (hors calendrier cible,
 * déjà représenté par les séances planifiées) sur une période, pour les afficher
 * dans la page Calendrier et visualiser les occupations perso.
 */
async function pushUnsyncedSessionsToGoogle(unsynced: PlannedSession[]): Promise<number> {
  let pushed = 0;
  for (const session of unsynced) {
    try {
      const result = await pushSessionToGoogle(session);
      if (result.synced) {
        pushed += 1;
      }
    } catch (error) {
      console.error('Push séance vers Google échoué', error);
    }
  }
  return pushed;
}

function eventStartIso(event: Awaited<ReturnType<typeof listEvents>>[number]): string | null {
  return event.start?.dateTime ?? event.start?.date ?? null;
}

function calendarEventViewParts(
  cal: Awaited<ReturnType<typeof listCalendars>>[number],
  e: Awaited<ReturnType<typeof listEvents>>[number],
  startIso: string,
  endIso: string,
): CalendarEventView {
  return {
    id: e.id,
    calendarId: cal.id,
    calendarName: cal.summary,
    color: cal.backgroundColor ?? null,
    summary: e.summary ?? '(sans titre)',
    start: startIso,
    end: endIso,
    allDay: !e.start?.dateTime,
  };
}

function mapGoogleEventToView(
  cal: Awaited<ReturnType<typeof listCalendars>>[number],
  e: Awaited<ReturnType<typeof listEvents>>[number],
): CalendarEventView | null {
  if (e.status === 'cancelled') {
    return null;
  }
  const startIso = eventStartIso(e);
  if (!startIso) {
    return null;
  }
  const endIso = e.end?.dateTime ?? e.end?.date ?? startIso;
  return calendarEventViewParts(cal, e, startIso, endIso);
}

async function fetchCalendarEventViews(
  token: string,
  cal: Awaited<ReturnType<typeof listCalendars>>[number],
  from: Date,
  to: Date,
): Promise<CalendarEventView[]> {
  const events = await listEvents(token, cal.id, from, to);
  return events
    .map((e) => mapGoogleEventToView(cal, e))
    .filter((view): view is CalendarEventView => isSet(view));
}

export async function getCalendarEvents(
  athleteId: string,
  from: Date,
  to: Date,
): Promise<CalendarEventView[]> {
  const account = await getGoogleAccount(athleteId);
  if (!account) {
    return [];
  }
  const token = await getValidAccessToken(athleteId);
  const calendars = await listCalendars(token);

  const hidden = new Set(account.hiddenCalendarIds ?? []);
  const results: CalendarEventView[] = [];
  await Promise.all(
    calendars.map(async (cal) => {
      // Le calendrier cible (SPORT) est déjà affiché via les séances planifiées.
      if (cal.id === account.targetCalendarId) {
        return;
      }
      // Calendriers masqués par l'utilisateur.
      if (hidden.has(cal.id)) {
        return;
      }
      try {
        const views = await fetchCalendarEventViews(token, cal, from, to);
        results.push(...views);
      } catch (error) {
        console.error(`Événements du calendrier ${cal.id} non récupérés`, error);
      }
    }),
  );
  return results;
}

function busyIntervalsInWindow(
  intervals: BusyInterval[],
  windowStart: Date,
  windowEnd: Date,
): BusyInterval[] {
  return intervals.filter((b) => {
    const start = new Date(b.start);
    const end = new Date(b.end);
    return end > windowStart && start < windowEnd;
  });
}

function formatBusyForCoach(
  busy: BusyInterval[],
  timeZone: string,
): Array<{ dayKey: string; start: string; end: string }> {
  return busy.map((b) => {
    const s = zonedDayAndMinutes(new Date(b.start), timeZone);
    const e = zonedDayAndMinutes(new Date(b.end), timeZone);
    return {
      dayKey: s.dayKey,
      start: minutesToHHmm(s.minutes),
      end: e.dayKey === s.dayKey ? minutesToHHmm(e.minutes) : '24:00',
    };
  });
}

/** Intervalles occupés à venir, résumés pour le contexte du coach. */
export async function getUpcomingBusy(
  athleteId: string,
  days = 21,
): Promise<Array<{ dayKey: string; start: string; end: string }>> {
  const [account, prefs] = await Promise.all([
    getGoogleAccount(athleteId),
    loadResolvedSourcePrefs(athleteId),
  ]);
  const calendarGate = googleCalendarGateFromPrefs(prefs);
  const timeZone = account?.timeZone ?? 'Europe/Paris';

  const now = new Date();
  const to = new Date(now.getTime() + days * 86400_000);
  const parts: BusyInterval[] = [];

  if (
    account &&
    shouldSyncGoogleCalendarFreeBusy({
      connected: isOAuthAccountConnected(account),
      calendarEnabled: calendarGate.calendarEnabled,
    })
  ) {
    try {
      const token = await validAccessTokenFor(athleteId, account);
      const calendarIds = await readableCalendarIds(athleteId, token);
      parts.push(...(await getFreeBusy(token, now, to, calendarIds)));
    } catch {
      // Google outage: still surface uploaded Apple busy below.
    }
  }

  if (calendarGate.calendarEnabled.includes('apple-calendar')) {
    parts.push(...busyIntervalsInWindow(await loadAppleCalendarBusy(athleteId), now, to));
  }

  if (parts.length === 0) {
    return [];
  }

  return formatBusyForCoach(mergeBusyIntervals(parts), timeZone);
}
