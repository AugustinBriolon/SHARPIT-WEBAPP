import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Sentry (EU) for the web and the API: errors only, never what the athlete measured or wrote.
 *
 * No tracing intent — Langfuse claims the global OTEL provider *before* Sentry.init
 * (ADR-060). No replay, no default PII.
 * Every event loses its request body, cookies, headers and query string before it is sent.
 * A DSN is a public client key: it can only send events.
 *
 * `enableOpenTelemetrySetup: false` keeps Sentry off the global OTEL provider altogether, so
 * Langfuse owns it whatever the init order. Sentry 11 dropped `skipOpenTelemetrySetup`, which
 * this file used to set: until then only the order in `instrumentation.ts` protected Langfuse.
 */
export const SENTRY_DSN =
  'https://fa037dbf4a20c605a69f85fae538b80f@o4512180262535168.ingest.de.sentry.io/4512180422246480';

export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url?.split('?')[0],
    };
  }
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  return event;
}

/**
 * What a browser says when a request never completed — offline, a tab closed mid-fetch, a crawler
 * cutting the connection. Nothing in the app to fix, and each one paged as a new issue
 * (SHARPIT-WEBAPP-9: a Google crawler on /start).
 */
export const BROWSER_TRANSPORT_ERRORS = [
  /^(TypeError: )?network error$/i,
  /^(TypeError: )?Failed to fetch$/,
  /^(TypeError: )?Load failed$/,
  /NetworkError when attempting to fetch resource/,
];

export function sentryOptions(app: 'web' | 'api') {
  return {
    ...(app === 'web' ? { ignoreErrors: BROWSER_TRANSPORT_ERRORS } : {}),
    dsn: SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    initialScope: { tags: { app } },
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableOpenTelemetrySetup: false,
    beforeSend: scrubSentryEvent,
  };
}
