import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import {
  BROWSER_TRANSPORT_ERRORS,
  SENTRY_DSN,
  scrubSentryEvent,
  sentryOptions,
} from './sentry-options';

describe('sentryOptions', () => {
  it('sends errors only, to the EU region, without personal data', () => {
    const options = sentryOptions('api');
    expect(new URL(SENTRY_DSN).host.endsWith('.ingest.de.sentry.io')).toBe(true);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.skipOpenTelemetrySetup).toBe(true);
  });
});

describe('scrubSentryEvent', () => {
  it('keeps the method and path, never the body, headers, cookies or query', () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        method: 'PUT',
        url: 'https://api.sharpit.app/api/planned-sessions/brick/evaluation?groupId=b1',
        data: '{"notes":"jambes lourdes"}',
        headers: { authorization: 'Bearer x' },
        cookies: { __session: 'x' },
        query_string: 'groupId=b1',
      },
    } as ErrorEvent);

    expect(event.request).toEqual({
      method: 'PUT',
      url: 'https://api.sharpit.app/api/planned-sessions/brick/evaluation',
    });
  });

  it('keeps only the user id', () => {
    const event = scrubSentryEvent({
      type: undefined,
      user: { id: 'athlete-1', email: 'a@b.c', ip_address: '1.2.3.4' },
    } as ErrorEvent);
    expect(event.user).toEqual({ id: 'athlete-1' });
  });
});

describe('browser transport errors', () => {
  const matches = (message: string) =>
    BROWSER_TRANSPORT_ERRORS.some((pattern) => pattern.test(message));

  it('drops a request that never completed, on the web only (SHARPIT-WEBAPP-9)', () => {
    expect(matches('TypeError: network error')).toBe(true);
    expect(matches('Failed to fetch')).toBe(true);
    expect(matches('Load failed')).toBe(true);
    expect(sentryOptions('web').ignoreErrors).toBe(BROWSER_TRANSPORT_ERRORS);
    expect('ignoreErrors' in sentryOptions('api')).toBe(false);
  });

  it('keeps real errors', () => {
    expect(matches("TypeError: Cannot read properties of undefined (reading 'id')")).toBe(false);
    expect(matches('network error while parsing the plan')).toBe(false);
  });
});
