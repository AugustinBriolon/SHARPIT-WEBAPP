# ADR-089: Enforced CSP without nonces, and caps on what reaches the model

**Status:** Accepted
**Date:** 2026-10-17
**Author:** Augustin Briolon
**Supersedes:** Part of ADR-088 — its open gaps « CSP Report-Only », « unbounded request sizes »
(coach thread, physical notes) and « nutrition reading », and its `127.0.0.1` dev binding

---

## Context

ADR-088 left four medium findings open. Each one is a way for a request to reach the model, or the
browser, with less control than it should have:

1. **CSP Report-Only.** `apps/web` and `apps/hub` sent `Content-Security-Policy-Report-Only` with no
   report endpoint, so the policy blocked nothing and told no one. Enforcing it as written would also
   have broken the web app: its `connect-src` omitted `api.sharpit.app`, which the browser calls with
   the Clerk Bearer token for every read (`packages/app/src/lib/api/api-fetch.ts`).
2. **Coach thread size.** A client-sent thread (`{ messages }`) or message (`{ message }`) had no
   size limit: one request could carry hundreds of thousands of tokens into a model call before the
   AI budget (ADR-077) refused the next.
3. **Physical notes.** `title`, `bodyPart`, `description` and the check-in `comment` had no
   `.max()`, and every one of them is written into the coach's prompt.
4. **Nutrition reading.** The Pro reading of a past food-log day regenerates whenever the day's
   input hash changes, so edit → read was an unbounded loop of model calls.

Next.js (16.3) offers a strict CSP through per-request nonces, which need every page rendered on
request: its guide states that nonces disable static optimisation. Both apps rely on the opposite.
`cacheComponents` serves each web route a prerendered shell (`x-nextjs-prerender: 1` in production),
which is the « Instant UX, framework side » of `apps/web/next.config.ts`, and the root layout
avoids runtime reads to keep it. The inline bootstrap and flight-data scripts of a prerendered
shell are written at build time, so no request nonce can reach them; hashes cannot cover them
either, since their content differs per page and build. The experimental SRI mode adds `integrity`
to external chunks only.

## Decision

1. **Enforce one shared policy** — `buildContentSecurityPolicy`
   (`packages/app/src/lib/security/content-security-policy.ts`) — as `Content-Security-Policy` in
   both apps. It names every host exactly: the API origin (`NEXT_PUBLIC_API_ORIGIN`), the Clerk
   Frontend API (decoded from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, no `*.clerk.*` wildcard), the
   Sentry ingest host (from the DSN), the map tiles, Cloudflare Turnstile and Garmin SSO frames.
   `script-src` keeps `'unsafe-inline'` (see above) and gets `'unsafe-eval'` in development only;
   `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
2. **Cap the client-sent coach thread** at 120 messages and 300 000 serialised characters
   (`COACH_CLIENT_THREAD_LIMITS`), checked before validation, storage reads or any model work; the
   chat route answers **413** with a « start a new conversation » message. In server-history mode
   the cap applies to the one message the client sends.
3. **Cap physical-note text** (`PHYSICAL_NOTE_LIMITS`): title 120, body part 80, description 2 000,
   check-in comment 1 000 characters. The iOS sensitive-zone sheet mirrors them.
4. **Give the nutrition reading its own budget**: `rateLimiters.nutritionReading`, 10 per hour per
   athlete, fail-closed. When it is spent, the athlete gets the last stored reading (or none), never
   an error.
5. **Dev servers bind `localhost`, not `127.0.0.1`.** Clerk's proxy rewrites to
   `http://localhost:…`; when that host differs from the bound one, Next proxies the rewrite as an
   external URL and every page hangs for 30 s. `localhost` is still loopback only.

## Options considered

### Option A — Nonce + `strict-dynamic` on every page

- **Pros:** no inline script runs unless the server wrote it for that request.
- **Cons:** every route renders on request: the prerendered shells and partial prefetching go,
  first paint waits on the server, and each view costs function CPU (a concern of ADR-055). It
  reverses the Instant UX architecture for a defence against an XSS sink no page has today
  (React escapes output; the only `dangerouslySetInnerHTML` is the constant theme script).

### Option B — Enforced host-exact policy, `'unsafe-inline'` kept for scripts (chosen)

- **Pros:** keeps prerendering; blocks scripts, connections, frames and form posts to any other
  host, so injected markup cannot load a remote script or send data out; works on both apps.
- **Cons:** an inline-script injection, if one ever appears, still runs.

### Option C — Stay Report-Only with a report endpoint

- **Pros:** zero breakage risk.
- **Cons:** blocks nothing; the gap stays open.

## Consequences

### Positive

- The browser refuses any script, fetch or frame outside the named hosts (checked locally: a fetch
  and a script to an unknown host are blocked, while every main web page, Clerk sign-in, map tiles,
  the map worker and the Sentry ingest load with no violation).
- No single request can carry an oversized thread or note into a model call, and nutrition readings
  are capped like session analyses.

### Negative

- Inline-script XSS is not prevented by the CSP; it rests on React's escaping and on keeping
  `dangerouslySetInnerHTML` out of user-supplied content.
- A thread past 120 messages must be continued in a new conversation (none comes close today).
- Native clients must keep within the note limits or get a 400 (iOS mirrors them).

### Neutral

- The policy depends on build-time `NEXT_PUBLIC_*` values, which the apps already need at build.
- `security-open-findings.test.ts` keeps only the low-severity gaps of ADR-088.

## References

- ADR-088 (security review), ADR-077 (AI budget), ADR-055 (Vercel CPU)
- `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`
