import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Sentry (EU) for the web and the API: errors only, never what the athlete measured or wrote.
 *
 * No tracing intent — Langfuse owns coach spans via an *isolated* TracerProvider
 * (ADR-060), not the global OTEL provider Sentry may claim. No replay, no default PII.
 * Every event loses its request body, cookies, headers and query string before it is sent.
 * A DSN is a public client key: it can only send events.
 *
 * `skipOpenTelemetrySetup` is kept for SDKs that honour it; Sentry 11 may still
 * initialise OTEL — that is why Langfuse must not call `NodeSDK.start()`.
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

export function sentryOptions(app: 'web' | 'api') {
  return {
    dsn: SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    initialScope: { tags: { app } },
    sendDefaultPii: false,
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    beforeSend: scrubSentryEvent,
  };
}
