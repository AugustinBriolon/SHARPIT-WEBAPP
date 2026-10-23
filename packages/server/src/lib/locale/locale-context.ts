import { AsyncLocalStorage } from 'node:async_hooks';
import { prisma } from '@sharpit/db/client';
import { hasBearer } from '@sharpit/app/lib/hosts/api-host';
import { englishDeep } from '@sharpit/server/lib/locale/translate-copy';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { startServerTiming, withServerTiming } from '@sharpit/server/lib/http/server-timing';
import {
  DEFAULT_LOCALE,
  isAthleteLocale,
  localeFromAcceptLanguage,
  type AthleteLocale,
} from '@sharpit/shared/locale';

/**
 * The language of the copy being written right now (ADR-096). Set once per app request and once
 * per athlete in background jobs, so the code that words things reads it without every signature
 * between the handler and the copy carrying it. French outside any of them: the web's language.
 */
const storage = new AsyncLocalStorage<AthleteLocale>();

export function currentLocale(): AthleteLocale {
  return storage.getStore() ?? DEFAULT_LOCALE;
}

export function runInLocale<T>(locale: AthleteLocale, work: () => T): T {
  return storage.run(locale, work);
}

/** The athlete's stored language, for work outside a request (pushes, crons). */
export async function storedAthleteLocale(athleteId: string): Promise<AthleteLocale | null> {
  // A failed read must never hold up the work it words: French then.
  const profile = await prisma.athleteProfile
    .findUnique({ where: { id: athleteId }, select: { locale: true } })
    .catch(() => null);
  return isAthleteLocale(profile?.locale) ? profile.locale : null;
}

/**
 * Language of an app request: the one its screens are in (Accept-Language), else the one the
 * athlete stored, else English — what the app shows on a device in neither of its languages.
 */
export async function appRequestLocale(request: Request): Promise<AthleteLocale> {
  const fromHeader = localeFromAcceptLanguage(request.headers.get('accept-language'));
  if (fromHeader) {
    return fromHeader;
  }
  const athleteId = await getCurrentAthleteId().catch(() => null);
  return (athleteId && (await storedAthleteLocale(athleteId))) || 'en';
}

/** A JSON response with its copy in English; any other response as it is. */
async function inEnglish<Res extends Response>(response: Res): Promise<Res> {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return response;
  }
  const body = englishDeep(await response.json());
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  }) as Res;
}

/** Wraps an `/api/v1` route so everything it writes is in the app's language. */
export function inAppLocale<Req extends Request, Rest extends unknown[], Res extends Response>(
  handler: (request: Req, ...rest: Rest) => Res | Promise<Res>,
): (request: Req, ...rest: Rest) => Promise<Res> {
  const wrapped = async (request: Req, ...rest: Rest) => {
    const timing = startServerTiming();
    // Only the app sends a Bearer: the web stays French whatever the browser's languages.
    const locale = hasBearer(request) ? await appRequestLocale(request) : DEFAULT_LOCALE;
    const response = await runInLocale(locale, () => handler(request, ...rest));
    const worded = locale === 'en' ? await inEnglish(response) : response;
    // Every app route says how long it took, so a slow screen shows which request held it.
    return withServerTiming(worded, timing.header('app'));
  };
  return Object.assign(wrapped, { [INNER]: handler });
}

const INNER = Symbol('inAppLocale.handler');

/** The handler an `inAppLocale` route runs — the `/api` twin's very handler (ADR-040). */
export function innerHandler(route: unknown): unknown {
  return (route as { [INNER]?: unknown } | undefined)?.[INNER] ?? route;
}

const ANSWER_IN_ENGLISH = `

---
LANGUAGE: the athlete reads SharpIt in English. Write every word they read in natural English, in
the same coach voice — second person, warm and plain, no hype, no emoji. The instructions above are
in French: follow their rules, not their language. Keep JSON keys, enum values and tool arguments
exactly as specified.`;

/** A system prompt (written in French) set to answer in the language of the copy being written. */
export function inAnswerLanguage(system: string): string {
  return currentLocale() === 'en' ? `${system}${ANSWER_IN_ENGLISH}` : system;
}

/**
 * Runs athlete-scoped background work (a cron, a webhook's refresh) in the athlete's stored
 * language. Inside an app request, the request's language already holds and is kept.
 */
export async function inAthleteLocale<T>(athleteId: string, work: () => Promise<T>): Promise<T> {
  if (storage.getStore()) {
    return work();
  }
  return runInLocale((await storedAthleteLocale(athleteId)) ?? DEFAULT_LOCALE, work);
}
