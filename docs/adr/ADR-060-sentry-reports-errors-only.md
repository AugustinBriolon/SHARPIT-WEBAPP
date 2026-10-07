# ADR-060: Sentry reports errors only

**Status:** Accepted
**Date:** 2026-10-01
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A

---

## Context

Before a public App Store launch, production errors were visible only in Vercel's function logs:
unsearchable, unaggregated, with no browser errors at all, and nothing from the iPhone app.

Two constraints shape what an error tool may do here:

- **The data is health data (art. 9 GDPR).** A report must never carry what the athlete
  measured or wrote: request bodies (journal answers, notes, brick evaluations), query strings
  (`?groupId=…`, `?date=…`), cookies and auth headers.
- **OpenTelemetry is already taken.** Sentry's JS SDK (v8+) often claims the global
  TracerProvider on `Sentry.init()`. Coach spans must still reach Langfuse without sharing
  that provider (privacy + sampling).

---

## Decision

1. **Sentry, EU region (`ingest.de.sentry.io`)**, one project for the web and the API (tagged
   `app: web | api`), one for iOS.
2. **Errors only.** `tracesSampleRate: 0`, no session replay, `skipOpenTelemetrySetup: true`
   when the installed Sentry SDK honours it. Langfuse does **not** call `NodeSDK.start()`;
   it uses an isolated TracerProvider via `setLangfuseTracerProvider` (Option C in the
   Langfuse "existing Sentry setup" FAQ) so coach spans keep flowing even if Sentry owns
   the global provider. (Regression 2026-10-01 → 2026-10-07: global `NodeSDK` after
   Sentry.init produced zero Langfuse observations.)
3. **Nothing personal leaves.** `sendDefaultPii: false`; `scrubSentryEvent` keeps a request's
   method and path only, and a user's id only. iOS strips breadcrumb URL queries, sends no
   screenshot or view hierarchy, and drops request data the same way.
4. **Wired through Next.js instrumentation**: `instrumentation.ts` (`register` +
   `onRequestError = Sentry.captureRequestError`) in `apps/api` and `apps/web`, and
   `instrumentation-client.ts` in `apps/web`. The shared options live in
   `@sharpit/app/lib/observability/sentry-options` so both apps read one definition.
5. **Production only** (`enabled` when `NODE_ENV === 'production'`), environment from
   `VERCEL_ENV`.

---

## Rationale

- Errors are the gap; performance is already visible through Vercel and Langfuse.
- Scrubbing in `beforeSend` is the last point before the network: whatever an integration
  attached, the event that leaves is reduced to method, path and id.

---

## Alternatives Considered

### Alternative 1: Vercel log drains only

- **Pros:** no new processor, nothing to scrub beyond what `safe-log` already does.
- **Cons:** no aggregation, no alerting, no browser or iPhone errors.
- **Why rejected:** does not show what athletes hit.

### Alternative 2: Sentry with tracing, sharing OpenTelemetry with Langfuse

- **Pros:** one trace from the request to the model call.
- **Cons:** two exporters on one NodeSDK, double the span volume, and spans whose attributes
  can carry prompt context.
- **Why rejected:** risk to the coach's telemetry and to privacy for a view nobody asked for.

---

## Consequences

### Positive

- Production errors on web, API and iPhone are grouped, searchable and alertable.
- The privacy policy names Sentry, with no health metric in reports.

### Negative

- Without tracing, a slow request is not in Sentry; Vercel and Langfuse remain the place.
- Source maps are not uploaded yet: browser stack traces stay minified until an auth token is
  added to the build.

### Scientific debt created

- None.

---

## Review Criteria

- If minified browser traces block a diagnosis, add `SENTRY_AUTH_TOKEN` and source map upload.
- If an event is ever seen carrying a body or a query, tighten `scrubSentryEvent` first.
