import { describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({
  prisma: { athleteProfile: { findUnique: vi.fn(async () => ({ locale: 'fr' })) } },
}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn(async () => 'a1'),
}));

import { currentLocale, inAppLocale, runInLocale } from './locale-context';

const request = (acceptLanguage?: string) =>
  new Request('https://api.sharpit.app/api/v1/today', {
    headers: {
      authorization: 'Bearer token',
      ...(acceptLanguage ? { 'accept-language': acceptLanguage } : {}),
    },
  });

describe('locale context', () => {
  it('is French outside any request', () => {
    expect(currentLocale()).toBe('fr');
    expect(runInLocale('en', currentLocale)).toBe('en');
  });

  it('words an app request in the language of its screens', async () => {
    const handler = inAppLocale(async () => new Response(currentLocale()));
    expect(await (await handler(request('en-GB,en;q=0.9'))).text()).toBe('en');
  });

  it('keeps the web in French whatever the browser asks', async () => {
    const handler = inAppLocale(async () => new Response(currentLocale()));
    const web = new Request('https://api.sharpit.app/api/coach/chat', {
      headers: { 'accept-language': 'en-US' },
    });
    expect(await (await handler(web)).text()).toBe('fr');
  });

  it('falls back to the stored language when the header names none SharpIt speaks', async () => {
    const handler = inAppLocale(async () => new Response(currentLocale()));
    expect(await (await handler(request('de-DE'))).text()).toBe('fr');
  });
});
