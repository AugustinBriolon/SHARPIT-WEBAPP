import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage, resolveAthleteLocale } from './locale';

describe('localeFromAcceptLanguage', () => {
  it('takes the first supported language in preference order', () => {
    expect(localeFromAcceptLanguage('de-DE, en-US;q=0.8, fr;q=0.9')).toBe('fr');
    expect(localeFromAcceptLanguage('en-GB,en;q=0.9')).toBe('en');
  });

  it('is null when nothing is supported or the header is missing', () => {
    expect(localeFromAcceptLanguage('de-DE, es;q=0.5')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage('en;q=0')).toBeNull();
  });
});

describe('resolveAthleteLocale', () => {
  it('prefers the stored choice, then the header, then French', () => {
    expect(resolveAthleteLocale('en', 'fr-FR')).toBe('en');
    expect(resolveAthleteLocale(null, 'en-US')).toBe('en');
    expect(resolveAthleteLocale('xx', 'de')).toBe('fr');
  });
});
