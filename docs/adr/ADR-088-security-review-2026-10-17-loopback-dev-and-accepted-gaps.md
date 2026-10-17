# ADR-088: Security review 2026-10-17 — loopback dev servers, one analysis budget, accepted gaps

**Status:** Accepted
**Date:** 2026-10-17
**Author:** Augustin Briolon
**Supersedes:** N/A

---

## Context

A security review of the web monorepo tested the local stack actively (dev servers, a disposable
Postgres) and production passively (response headers, CORS, TLS). Its findings fall in two groups:
two that call for a fix now, and a set of medium/low gaps that are accepted for now and must stay
visible.

**Fixed now.**

1. **Dev servers on the LAN.** `apps/api` and `apps/web` ran `next dev -H 0.0.0.0`, and
   `docker-compose.yml` published Postgres on `0.0.0.0:5432` with `sharpit/sharpit`. With
   `DEV_BYPASS_CLERK=true`, a dev server answers every request as the local athlete, and in
   `development` rate limits (`isRateLimitBypassed`) and the AI budget (`ensureFreeAiBudget`) are
   skipped while `.env` carries a real `AI_GATEWAY_API_KEY`. On a shared network (the corporate LAN
   the owner works on) anyone could read and write the local data and spend AI credits.
2. **Session analysis outside its budget.** `POST /planned-sessions/[id]/analyze` is capped by
   `rateLimiters.sessionAnalyze` (20 / h). The same model call also ran on every link
   (`POST /planned-sessions/[id]/link`) and on today's auto-link (`GET /v1/today` →
   `analyzeLinkedPlannedSessions`), with no limit: unlink → relink was an unbounded loop of model
   calls from any account.

**Accepted for now (open).** Each is pinned by an `it.fails` test in
`packages/server/src/security-open-findings.test.ts`, which turns red when the gap is closed.

- **CSP Report-Only** (`apps/web/next.config.ts`): the policy is `Content-Security-Policy-Report-Only`
  with `'unsafe-inline'` in `script-src`, and no `report-uri`/`report-to`, so violations are
  reported nowhere. Production confirms the header. Enforcing it blind risks breaking Clerk sign-in
  and the map tiles, which can only be verified in a live browser session.
- **Coach approvals are not bound server-side.** Tool approvals travel in the client's thread; there
  is no `experimental_toolApprovalSecret`, on purpose, so the athlete can edit a proposal (grams,
  meal) before approving. A client can therefore send an approval the server never issued. Inputs
  are re-validated by zod, writes are scoped to the session's athlete, and the same writes are open
  to that athlete through the REST API, so a forged approval gains nothing over a direct call.
- **Unbounded request sizes.** No `.max()` on free text (physical notes, conversation messages),
  no cap on `?limit=` (activities), `?days=` (health) or planned-session `from`/`to`; no body cap
  beyond Vercel's 4.5 MB. A large thread inflates one coach call; the AI budget stops the next one.
- **Prompt delimiting.** Athlete-written text (titles, notes, Strava descriptions) is inserted raw
  into coach prompts and can open a fake `## section`. Every such text is the athlete's own; no
  third-party text (calendar busy blocks carry no titles) reaches the prompts.
- **Foreign references.** A planned session (`goalId`), a brick and a saved-meal item (`productId`)
  accept another athlete's id without an ownership check. Ids are cuids, and no read found returns
  the foreign row's content.
- **Nutrition reading.** The Pro nutrition reading regenerates once per change of the day's input
  hash, with no per-athlete limit.

Tenant isolation itself holds: `packages/server/src/handlers/tenant-isolation.test.ts` calls every
`[id]` handler as athlete A on athlete B's rows against a real Postgres, and nothing leaks or
changes.

## Decision

1. Dev servers bind `127.0.0.1` (`next dev -H 127.0.0.1`, hub included) and docker Postgres
   publishes `127.0.0.1:5432`. Listening on the LAN, for phone testing, is an explicit
   `yarn web dev:lan` / `yarn api dev:lan`, never combined with the Clerk bypass.
   `apps/api/src/dev-binding.test.ts` guards the defaults.
2. `analyzeLinkedPlannedSessions` checks `rateLimiters.sessionAnalyze` (fail-closed) before each
   session, and the link route goes through it: every path to the session analysis shares the
   20 / h budget of `/analyze`.
3. The open gaps above stay open, each pinned by an `it.fails` test, until a later change closes
   it. The CSP is flipped to enforcing only after a staged run with a report endpoint shows no
   violation on sign-in and maps.

## Options considered

### Option A — Fix the two exploitable gaps, record the rest (chosen)

- **Pros:** closes the two paths that let someone else (LAN) or a loop (relink) spend money; small,
  reversible diffs; the rest is listed, tested and dated rather than forgotten.
- **Cons:** medium gaps (thread size, CSP) stay open until scheduled.

### Option B — Fix every finding in one pass

- **Pros:** no open list.
- **Cons:** an enforced CSP cannot be validated without a live Clerk session and could lock every
  athlete out; length caps need product decisions per field; one large security commit is hard to
  review and to revert.

### Option C — Keep `0.0.0.0` and guard the bypass by request address

- **Pros:** phone testing stays one command.
- **Cons:** a Next route handler cannot trust the caller's address (`Host` and forwarded headers
  are client-set); it leaves Postgres exposed anyway.

## Consequences

### Positive

- A dev machine on a shared network no longer exposes an authenticated-as-owner API, the AI key or
  the database.
- Session analyses per athlete are capped at 20 / h whatever the trigger.
- Every accepted gap has a test that fails the build the day it is closed, so the list cannot rot.

### Negative

- Phone testing needs `dev:lan` (and a real Clerk session).
- A first sync that links more than 20 sessions in an hour analyses the first 20; the rest can be
  analysed later from the session page.
- The CSP still does not block inline script injection.

### Neutral

- The tenant-isolation suite runs only with `TENANT_ISOLATION_DATABASE_URL` set (a disposable
  database); `yarn test` skips it.

## References

- `packages/server/src/security-open-findings.test.ts`
- `packages/server/src/handlers/tenant-isolation.test.ts`
- `apps/api/src/dev-binding.test.ts`
- ADR-048 (api host), ADR-077 (coach AI budget)
