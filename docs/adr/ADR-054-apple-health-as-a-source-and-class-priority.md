# ADR-054: Apple Health is a source like the others, and the primary per class is honoured

**Status:** Accepted
**Date:** 2026-09-29
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** extends ADR-027 and ADR-043

---

## Context

ADR-027 lets the athlete pick, per data class, which connected providers feed it (`enabled`) and
which one is the source of truth (`primary`). Only part of it was honoured: the enabled gates for
Garmin and Strava activities, a Garmin-only read gate for wearable health, and the primary for body
composition. Apple Health sat outside the model — a gap filler with hard-coded rules (days only
where no provider wrote, workouts only while no Garmin or Strava account was connected, ADR-043) —
and the iPhone app had no way to choose. The athlete asked to give priority to a preferred provider
per category.

## Decision

1. **Apple Health is an integration (`apple-health`)** covering `activities`, `wearable_health` and
   `body`. It has no account: the iPhone app's switch links it (`POST /api/v1/apple-health/link`,
   `AthleteProfile.appleHealthLinkedAt`), and any upload links it too. Linking for the first time
   enables it for every class it covers, as connecting a provider from the settings does; unlinking
   takes it out of every class. The web lists it, greyed: it can only be linked from the iPhone.
2. **Wearable health follows the primary.** Apple Health's day fields (`appleHealthPolicy`) and
   Garmin's shared ones — the night, resting HR, HRV, steps — (`garminHealthWrite`) are each `own`
   (primary, or only source), `fill` (another source is primary: gaps only) or `off` (not enabled
   for the class). The night and HRV move as blocks: stages or a baseline from one source beside a
   total from another would not add up. Behind Apple Health, Garmin feeds the Core none of the
   shared observations (sleep, HRV, resting HR); its own readings (readiness, body battery, stress)
   always go in. Apple's HRV (SDNN) enters beside Garmin's (RMSSD) only when Apple owns the class.
3. **Body follows the primary** for Apple Health's weight the same way.
4. **Activities.** Apple Health workouts are taken while Apple Health is enabled for activities
   (no longer only without Garmin). A session another source already holds is matched by fingerprint
   and **enriched** (fill blank scalars, metrics, streams) — never duplicated. Sync order prefers
   Garmin › Strava › Apple Health as the primary row; secondary providers only fill missing fields.
   Fingerprints use **wall-clock-as-UTC** for Strava (`start_date_local`), Apple Health, and Garmin
   so App Store athletes (Strava + Apple Health) do not get duplicate rows from timezone offset.
   `Activity.source` carries multi-provider provenance (`strava+apple-health`, `both`, …).
   When Strava or Garmin merges onto a row that first wrote a **manual** Core SESSION (Apple Health),
   that manual observation is removed before the provider session is ingested — including when
   `source` has already become `strava` after an earlier merge — so the day's load is not counted
   twice. Stream stubs (`available: false`) do not block a later provider from writing usable series.
5. **Reads** of the day rows need any source enabled for `wearable_health`, not Garmin specifically.
6. The native app reads and writes the prefs through `/api/v1/integrations/source-prefs`, whose GET
   also lists each class with the providers that can feed it.

## Consequences

- A change of primary applies from the next write on: days already written stay as they are.
- `fill` needs the day's current row before Garmin writes it: one more read per synced day while
  Apple Health is the primary.
- Strava is available again in the catalog (OAuth + cron): default activities preference remains
  Garmin > Strava > Apple Health. App Store distribution still hides Garmin in the iPhone app
  (TestFlight/debug only); store athletes use Strava + Apple Health.
