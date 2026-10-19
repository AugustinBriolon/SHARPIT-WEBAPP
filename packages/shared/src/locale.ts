/** Languages SharpIt speaks (ADR-096). French is the source language and the fallback. */
export const ATHLETE_LOCALES = ['fr', 'en'] as const;
export type AthleteLocale = (typeof ATHLETE_LOCALES)[number];
export const DEFAULT_LOCALE: AthleteLocale = 'fr';

export function isAthleteLocale(value: unknown): value is AthleteLocale {
  return typeof value === 'string' && (ATHLETE_LOCALES as readonly string[]).includes(value);
}

/** First supported language of an `Accept-Language` header, in the client's order of preference. */
export function localeFromAcceptLanguage(header: string | null | undefined): AthleteLocale | null {
  if (!header) {
    return null;
  }
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { language: tag.split('-')[0]!.toLowerCase(), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.map((entry) => entry.language).find(isAthleteLocale) ?? null;
}

/** The athlete's stored choice wins; else the request's languages; else French. */
export function resolveAthleteLocale(
  stored: string | null | undefined,
  acceptLanguage?: string | null,
): AthleteLocale {
  if (isAthleteLocale(stored)) {
    return stored;
  }
  return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/** BCP 47 tag for `Intl` formatting in that language. */
export function intlTag(locale: AthleteLocale): string {
  return locale === 'en' ? 'en-GB' : 'fr-FR';
}
