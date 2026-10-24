# ADR-103: Garmin returns through the official Personal API with a write-only key

**Status:** Accepted  
**Date:** 2026-10-24  
**Author:** Augustin Briolon (with Claude Code)  
**Supersedes:** [ADR-047](./ADR-047-garmin-connects-in-an-in-app-authentication-session.md)

---

## Context

SharpIt read Garmin through the unofficial Connect login (`@flow-js/garmin-connect`, DI OAuth
minted in an in-app SSO session, ADR-046/047). On 2026-10-20 that integration was retired and the
`GarminAccount` table dropped (commit `90989228`). Server-side login kept breaking, and the
unofficial access could not ship to the App Store.

On 2026-10-21 Garmin reopened its Connect Developer Program with three tiers:

- **Personal**: free. A Garmin user creates a key in Connect (Settings > Personal API token),
  valid 30 days to 1 year and shown once. The key is exchanged at
  `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token`
  (`Authorization: ApiKey <key>`) for a 24 h bearer, with no refresh token. Access is
  read-only and pull-only. The paths are the Connect ones (`/activitylist-service/…`,
  `/hrv-service/…`, `/sleep-service/…`). Garmin's FAQ says it "is not intended for commercial
  applications serving multiple end users".
- **Startup**: free up to 1,000 users, with OAuth for end users and the Training/Courses APIs
  that send workouts to the watch. It needs an application and review.
- **Enterprise**: paid.

The athlete wants Garmin back now, entered from their Garmin profile, with the key protected so
that SharpIt's operator does not have it in hand.

---

## Decision

Bring Garmin back on the **Personal API**, keyed per athlete, behind an allowlist, and apply for
the Startup tier in parallel.

1. **Storage.** `GarminAccount.apiKeyEnc` holds the key, AES-256-GCM with `SECRET_ENCRYPTION_KEY`
   (`secret-box.ts`, the same scheme as Withings and Strava tokens). `apiKeyLast4` is the only
   part of the key any surface shows. Migration `20261024120000_garmin_personal_api_key` creates
   the table again (the drop migration is already applied and stays).
2. **Write-only.** `POST /api/v1/garmin/connect` checks the key with Garmin (token exchange plus
   a profile read) before storing anything. No response, log or Sentry event carries the key.
   `GET /api/v1/garmin/connect` returns `{ available, connected, apiKeyLast4, lastSyncAt }`.
   `safe-log` redacts `api_key`/`apiKey` fields. Sentry already drops request bodies.
3. **One decrypt site.** `buildFreshGarminClient` decrypts the key, exchanges it for a bearer for
   the length of one sync, and drops it. The bearer is not persisted.
4. **Revocation.** A key Garmin refuses (400/401/403) empties `apiKeyEnc` through
   `revokeGarminCredentials`, and the hub asks for a new key. Disconnect deletes the row.
5. **Allowlist.** `GARMIN_PERSONAL_KEY_ATHLETES` (comma-separated athlete ids) opens the key
   form. The id is already in hand on every request, whereas an email check costs a Clerk API
   call. Everyone else gets a 403, and the web and iOS do not offer Garmin to them.
6. **Data path.** The retired activity, multisport, stream and daily-health code is restored and
   now runs on `GarminPersonalClient` (`garmin-personal-api.ts`) instead of the unofficial
   client. SSO, DI OAuth, the token importer and workout push are not restored: the Personal tier
   cannot write to the watch.
7. **Multi-source merge.** A session another source recorded first follows the activities'
   primary (ADR-027). If Garmin leads (it is the primary, or none is set), its measures replace
   the other source's, and the Core keeps one SESSION for the row: the Apple Health and Strava
   observations are removed before Garmin's is ingested. The engine's externalId dedup cannot
   match a Strava id against a Garmin id, so before this change a session Strava sent first was
   counted twice. If Garmin does not lead, it only fills blanks and ingests nothing. In both cases
   the title, RPE, feeling and notes the athlete may have written are filled, never replaced
   (`garmin-merge-policy.ts`). Garmin covers no body class, so its weight only fills a day no
   scale weighed.
8. **Web and iOS.** Compte › Sources (web) and Paramètres › Sources de données (iOS) take the key
   in a dedicated form: create-key link, password field, "Remplacer la clé" once linked. Both show
   the Garmin mark.
9. **Official provider.** Garmin is no longer in `UNOFFICIAL_PROVIDERS`, so connecting it asks for
   the health consent only.

---

## Rationale

- The Personal API is the only official Garmin access available today without a review.
- The rest of the stack reads Connect JSON, and the Personal API serves the same paths, so most
  of the retired data code works unchanged once the transport is swapped.
- Background sync (cron, ADR-055) needs a server-side credential. Encrypting it at rest, never
  returning it and decrypting it in one place is the strongest guarantee that still allows a
  sync with the iPhone closed.
- The allowlist keeps SharpIt within the Personal tier's intent (the developer and a few
  testers) until Startup OAuth replaces it.

---

## Alternatives Considered

### Alternative 1: Key kept on the iPhone only (Keychain)

**Description:** The app holds the key, calls Garmin itself and uploads the data.

**Pros:**

- The server never sees the key, so the operator cannot decrypt it.

**Cons:**

- No sync while the app is closed: cron, the morning recalibration and pushes would read stale
  Garmin data.
- Garmin parsing would have to be rebuilt in Swift. The web would have no Garmin at all.

**Rejected because:** the coach depends on overnight data arriving before the athlete opens the
app (the athlete's choice, 2026-10-24).

### Alternative 2: Open the key form to every athlete

**Description:** Any athlete pastes a Personal key from Compte > Sources.

**Pros:**

- Garmin for everyone immediately.

**Cons:**

- Garmin states the Personal tier is not for multi-user commercial apps, so keys can be cut off
  and the account sanctioned.
- Each athlete has to create, paste and renew a key (30 days to 1 year): heavy friction for a
  first connection.

**Rejected because:** of the terms risk. Startup OAuth is the public path.

### Alternative 3: Envelope encryption through a KMS

**Description:** A per-row data key wrapped by a cloud KMS, decrypted only by the sync worker,
with audit logs.

**Pros:**

- Decryption is audited, and a stolen database dump plus the app env is not enough.

**Cons:**

- A new cloud dependency and IAM setup for one column. The sync worker still decrypts, so the
  operator could still reach the key through the worker.

**Rejected because:** it costs a new infrastructure piece for a handful of allowlisted keys.
Revisit if Garmin moves to Startup with public users.

---

## Consequences

### Positive

- Garmin activities (with streams and multisport legs), sleep, HRV, resting HR, stress, body
  battery, steps and weight sync again, by cron and on demand.
- The key is never displayed or logged after entry. The athlete can revoke it at Garmin at any
  time, and the next sync then clears it here.

### Negative

- Whoever controls production (`SECRET_ENCRYPTION_KEY` plus the database) can technically decrypt
  the key. This is stated to the athlete in the key sheet's wording ("chiffrée", "révocable").
- Some endpoints the old code read (training readiness, power zones, exercise sets, activity
  details) are not documented for the Personal API. They are read best-effort and may come back
  empty. This has not been verified against a real key yet.
- The key expires (up to 1 year). The athlete has to enter a new one when Garmin refuses it.
- No workout push to the watch: the Personal API is read-only, and the Training API is for the
  business tiers. It comes back with Startup OAuth, Pro-gated as before (decided 2026-10-24).

### Neutral

- `@flow-js/garmin-connect` stays a dependency for its `IActivity` type only.
- The `GARMIN_PERSONAL_KEY_ATHLETES` env var must be set in production (Vercel, `apps/api`).

---

## References

- Garmin Personal API FAQ: https://developer.garmin.com/gc-developer-program/personal/personal-faq/
- Garmin's reference client: https://github.com/garmin/connect-personal-api-python
- Retirement commit `90989228`; [ADR-003](./ADR-003-garmin-primary-source.md),
  [ADR-047](./ADR-047-garmin-connects-in-an-in-app-authentication-session.md)
