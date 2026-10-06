# ADR-072: The web becomes a reading carnet; the iPhone app is where the athlete acts

**Status:** Accepted
**Date:** 2026-10-05
**Author:** Augustin Briolon
**Supersedes:** N/A (narrows the web's role from ADR-040 and ADR-048)

---

## Context

The native iPhone app (SHARPIT-APP) now does everything the web app does: the gaps listed by the
web/app audit of 5 October 2026 are closed by the app's own pull requests, over `/api/v1`
(ADR-040). Two products that write the same data with two interfaces cost every feature twice,
and the web's 44 pages and ~110k lines of `apps/web` are mostly write paths: forms, dialogs,
drawers, the coach chat, the food log.

What a browser does better than a phone is reading: a wide screen, long periods, a season at a
glance, a session's map and curves at full size.

---

## Decision

1. **The web becomes a carnet: it reads, it does not write.** Eight pages — Aujourd'hui, La
   saison, Les bilans, Les séances (and each session), Les records, Le corps, La nutrition,
   Compte. No form, dialog, « … » menu or coach chat. Where an action would sit, one line says it
   happens in the iPhone app.
2. **Only what needs a browser stays an action:** linking a source whose OAuth runs in the browser
   (Withings, Google Agenda), the athlete's data rights (consents, export, account deletion) and
   signing out.
3. **No onboarding on the web.** A new account is made and onboarded in the app.
4. **Server components, read through `api.`** Each page reads the signed-in athlete with
   `serverApiJson`, `/api/v1/*` first and the existing `/api/presentation/*` view models where the
   web already had a reading; the web computes nothing. One section that fails to read says so
   and the page stands.
5. **The API does not change.** `apps/api`, `packages/server` and `packages/core` stay as they
   are; no handler is removed with the old pages. Routes only the old web calls are pruned later,
   one by one, while `apps/api/src/app/api/v1/native-surfaces.test.ts` stays green.
6. **Built beside, switched once.** The carnet lives at `/carnet`, admins only, until the iPhone
   app is on the App Store. The switch-over makes it the web's root, redirects the old URLs to
   their reading (`/plan` → La saison, `/activite/[id]` → the session), sends sign-up to the App
   Store, and only then deletes the old pages.
7. **Dropped, not ported:** the journal analyses and habit experiments (ADR-032, still Proposed)
   and the scenario comparison.

---

## Rationale

- One place to act removes the second implementation of every write, the source of most parity
  drift between the two clients.
- Reading is where the web keeps an edge over the phone; writing on the web was the same flow as
  the phone's, with a mouse.
- Server components that render view models need no client cache, no optimistic writes and no
  offline layer, so the carnet is a small fraction of today's `apps/web`.

---

## Alternatives Considered

### Keep both clients at parity

**Rejected because:** every feature ships twice, and the audit showed how quickly they drift.

### Delete the web app entirely

**Rejected because:** OAuth sources (Withings, Google) and data rights need a browser, and a wide
screen reads a season or a session better than a phone.

---

## Consequences

### Positive

- `apps/web` shrinks to a reading surface; product work happens once, in the app.
- Every web reading that moves onto `/api/v1` also serves the app.

### Negative

- An athlete without an iPhone can no longer act (accepted: the beta is iPhone athletes).
- Until the switch-over, both web apps ship side by side.

---

## Review Criteria

- If an Android client or non-iPhone athletes become a target, revisit what the web may write.
- If athletes ask for an action on the web often enough in the beta feedback, weigh it here
  before adding it.
