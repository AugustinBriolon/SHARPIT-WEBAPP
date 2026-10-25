# ADR-105: Garmin connects through the Developer Program OAuth and push

**Status:** Accepted  
**Date:** 2026-10-24  
**Author:** Augustin Briolon (with Claude Code)  
**Supersedes:** [ADR-103](./ADR-103-garmin-returns-through-the-personal-api-with-a-write-only-key.md)

---

## Context

ADR-103 brought Garmin back through the Personal API: one key per athlete, pasted by hand,
allowlisted, because that tier is for one person's own data. On 2026-10-24 Garmin approved
SharpIt for the Connect Developer Program (**Starter** tier). The specs are in `docs/garmin/`:
OAuth2 PKCE, Health API, Activity API and Training API V2.

What the specs impose:

- **OAuth2 PKCE with a client secret.** The token exchange and refresh must run on the server.
  Access tokens last 24 h, and refresh tokens three months, rotated on every refresh. The API
  user id (`/partner-gateway/rest/user/id`) is stable and names the user in every notification.
  The app must call `DELETE /user/registration` when the athlete disconnects or deletes their
  account, and listen for deregistration and permission-change notifications.
- **Push only on Starter.** Ping/Pull and historical backfill (`HISTORICAL_DATA_EXPORT`) are
  Enterprise-only, and ad-hoc requests are not allowed. Garmin POSTs the summaries as JSON to the
  configured URLs, must get a 200 within 30 s, and expects processing to happen after that.
  There is no history: data starts at the connection.
- The summaries differ from Connect's internal JSON. The Health API has no training readiness,
  no HRV status or baseline, and no Body Battery level (only charged/drained). The Activity API
  has no RPE, no feeling, no exercise sets and no TSS. Activity details carry samples down to
  one per second.

---

## Decision

Garmin becomes an OAuth provider like Strava and Withings, fed by push.

1. **Connect.** `/api/garmin/connect` → `connect.garmin.com/oauth2Confirm` → `/api/garmin/callback`,
   on the shared connect state (ADR-048). The PKCE verifier is an HMAC of the signed state with the
   client secret, so it is never sent and never stored. iOS uses the native OAuth handoff
   (`/api/v1/garmin/handoff`, `/connect/garmin/start|callback` on the apex). `GarminAccount` holds
   `garminUserId` (unique: one Garmin account feeds one athlete), encrypted access and refresh
   tokens, `expiresAt` (ten minutes early) and the consented `permissions`.
2. **Push.** A single endpoint, `/api/garmin/push/<GARMIN_PUSH_SECRET>` (the portal cuts a `?key=` on save, so the secret rides in the path; the query form is still read), is configured for
   every summary type. Garmin signs nothing, so the secret is the authentication, compared in
   constant time. Each summary list is stored as a `GarminPushInbox` row before the 200.
   Processing runs in `after()`, and the sync cron replays unprocessed rows (five tries).
3. **Mapping.** Pushed summaries are mapped onto the shapes SharpIt already reads
   (`garmin-push-mappers.ts`): activities → Connect `IActivity` (merge rules of ADR-103 point 7
   unchanged), details → `RawStreams` (at most 2 000 points), and dailies, sleeps, HRV and body
   composition → `GarminDailyHealth` partial days. Each push writes only its own fields.
   `userMetrics` VO2max goes to the profile. Multisport parents and transitions are dropped, and
   the legs are unified as for every provider (ADR-078).
4. **Lifecycle.** Disconnecting or deleting the account calls `DELETE /user/registration`, best
   effort. A deregistration push deletes the row, and a permission change updates `permissions`.
5. **Removed.** The Personal API key path (client, allowlist, key forms on web and iOS,
   `apiKeyEnc`). Garmin pull sync (on open, cron, manual). Fetch-on-read of Garmin streams and
   multisport legs. The thresholds import. Migration `20261024180000_garmin_oauth` drops the key
   rows: a key cannot become an OAuth grant.
6. **Next.** Sending planned workouts to the watch (Training API V2, `WORKOUT_IMPORT`,
   Pro-gated) is a separate change.

---

## Rationale

- Starter is the tier Garmin approved for SharpIt. Push is the only delivery it offers.
- Storing before answering keeps Garmin's 30 s rule without risking data loss on a crash. The
  inbox replay reuses the existing cron (Vercel Hobby limits the number of crons).
- Mapping onto existing shapes reuses the whole multi-source merge (ADR-054, ADR-103) instead of
  a second import path.

---

## Alternatives Considered

### Alternative 1: Keep the Personal API key next to OAuth

**Pros:** history for the developer's own account.

**Cons:** two Garmin paths to maintain, and the Personal tier is not meant for a multi-user app.

**Rejected because:** OAuth covers every athlete, and history is an Enterprise feature by design.

### Alternative 2: Process the push inside the request

**Pros:** no inbox table.

**Cons:** a slow merge or Core ingest breaks the 30 s rule, and a crash loses the push.

**Rejected because:** Garmin's spec warns against exactly this.

### Alternative 3: Activity Files (FIT) instead of Activity Details

**Pros:** no 4.5 MB request body limit, full fidelity.

**Cons:** a FIT parser dependency, a callback download within 24 h, and a 50/min Starter rate
limit.

**Rejected because:** details cover the sessions SharpIt reads today. FIT stays the fallback if
very long sessions hit the body limit (noted in the push handler).

---

## Consequences

### Positive

- Athletes connect Garmin in one step on web and iOS. No key to create or renew.
- New sessions and nights arrive within minutes of a watch sync, with no polling.

### Negative

- No history at connection on Starter. Strava or Apple Health remain the way to bring the past.
- Readiness, HRV status and baseline, Body Battery level, RPE and exercise sets no longer come
  from Garmin. The readings built on them fall back to the other sources or stay empty.
- `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET` and `GARMIN_PUSH_SECRET` must be set on the API
  project, and the push URL configured at apis.garmin.com/tools/endpoints.

### Neutral

- `@flow-js/garmin-connect` stays for its `IActivity` type only.
