# ADR-047: iOS connects Garmin in an in-app authentication session

**Status:** Superseded by [ADR-103](./ADR-103-garmin-returns-through-the-personal-api-with-a-write-only-key.md)  
**Date:** 2026-09-26  
**Author:** Augustin Briolon (with Claude Code)  
**Supersedes:** [ADR-046](./ADR-046-garmin-connects-in-app-with-native-credentials.md)

---

## Context

ADR-046 moved the iOS Garmin connection from a Safari handoff to a native credentials form posting to `POST /api/v1/garmin/connect`, which logs in to Garmin from SharpIt's server. On device it failed with `Widget DI exchange failed after ticket … invalid service ticket provided`. Its findings: the server cannot present a browser TLS fingerprint (the mobile login the reference implementation relies on), and even the reference expects the DI exchange of a server-minted widget ticket to fail at times. Server-side Garmin login is fragile by construction.

The product requirement stands: the athlete connects Garmin without leaving the app.

---

## Decision

Connect Garmin from iOS in an `ASWebAuthenticationSession` (SwiftUI `WebAuthenticationSession`, ephemeral) opened on the apex:

1. The app asks `POST /api/v1/garmin/handoff` (Clerk Bearer) for an entry URL: `https://sharpit.app/sign-in?__clerk_ticket=<one-time Clerk sign-in token, 60 s>&redirect_url=https://sharpit.app/connect/garmin/start`.
2. The web's `<SignIn>` redeems the ticket — the athlete never signs in twice — and `/connect/garmin/start` runs Garmin's browser SSO: the password is typed on Garmin's own page, from the athlete's device.
3. Every exit ends on `https://sharpit.app/connect/garmin/callback?garmin=<status>`; the session watches that `https` callback (the apex AASA declares the path) and closes on it. The app reads the status with `IncomingLink`.

`POST /api/v1/garmin/connect` is removed (2026-09-26): no client calls it.

---

## Rationale

- In-app: a system sheet over the app, closed automatically on the callback.
- Reliable: the Garmin ticket is minted by a real browser on the athlete's device, the path the web's `sso-callback` already exchanges.
- The Garmin password never reaches SharpIt.
- The session is ephemeral and signed in through a ticket for the Bearer's own user, so it can never act as whoever is signed in to SharpIt in Safari.

---

## Alternatives Considered

### Alternative 1: Native credentials form (ADR-046)

**Description:** The app posts the Garmin e-mail and password; the server logs in.

**Pros:**

- Fully native UI.

**Cons:**

- Fails on device today (DI ticket rejected); Node on Vercel cannot mimic a browser TLS fingerprint.
- The Garmin password transits SharpIt's server; MFA accounts are unsupported.

**Rejected because:** it does not work reliably and handles a third-party password.

### Alternative 2: Safari handoff with universal-link return

**Description:** Open `/connect/garmin` in Safari; return through the universal link.

**Pros:**

- Works with the web flow as it is.

**Cons:**

- Leaves the app; the athlete may have to sign in to the web again.

**Rejected because:** leaving the app is what the product wants to remove.

---

## Consequences

### Positive

- The Garmin connection works the way the web's does, from inside the app.
- One handoff for every Garmin entry point in the app (Connexions, onboarding sources), and one copy of the outcomes (`GarminConnectOutcome`) for the in-app session and the universal-link return.

### Negative

- The entry URL is a credential for 60 seconds: it must never be logged, cached (`private, no-store`) or shared; the route logs error names only.
- The flow depends on pages on the apex (`/sign-in`, `/connect/garmin/*`): the apex hub (step 8 of the host split) must keep them.
- Ephemeral sessions do not remember Garmin's own sign-in: the athlete types the Garmin password each time they connect.

### Scientific debt created

- None.

---

## Review Criteria

- If Clerk stops redeeming `__clerk_ticket` in `<SignIn>`, sign the ticket in explicitly on a dedicated page.
- If Garmin publishes a supported OAuth flow for this data, replace the SSO handoff with it.
