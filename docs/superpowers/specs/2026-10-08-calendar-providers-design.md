# Design: Calendar providers (Google + Apple) with target calendar and no double-write

**Date:** 2026-10-08  
**Status:** Accepted  
**Approach:** One writer (primary); busy may merge from all enabled calendar providers  
**Plan:** `docs/superpowers/plans/2026-10-08-calendar-providers.md`

### Locked decisions

1. Integration id: `apple-calendar`
2. Primary switch: leave orphan events on the previous calendar
3. v1 Apple busy: upload intervals to the API for coach / free slots

---

## Problem

Athletes need external calendars so Sharpit can:

1. **Read** busy events and propose sessions on free slots.
2. **Write** planned sessions into a chosen calendar.
3. **Follow** when the athlete moves or deletes that session event in the calendar (calendar wins for schedule).

Today:

- **Google Agenda** does read (free/busy) + write + pull-back on the server, but **iOS cannot pick the target calendar** among several (web can).
- **« Calendrier de l’iPhone »** (`PlanCalendarSync`) only **copies** the plan into a dedicated « SharpIt » calendar. It does not read other calendars for busy, and refresh **overwrites** EventKit from Sharpit (calendar does not win).
- Having both Google write and Apple copy would **double-write** and confuse who is source of truth.

---

## Goals

- Provider **Google Agenda** and **Calendrier Apple** are peers under data class `calendar`.
- Athlete chooses **provider primary** (who writes / follows) and **which calendar** to write into for that provider.
- When both providers are enabled: **only primary writes**; secondary may still feed **busy** for free-slot placement.
- One clear place in the app (Sources / Priorités), not a separate “copy plan” switch that fights the primary.

### Non-goals (this spec)

- iCloud Calendar via CalDAV on the web (Apple stays **on-device** via EventKit).
- Writing Sharpit sessions into _all_ calendars.
- Syncing non-Sharpit events into Sharpit as planned sessions.

---

## Product rules

### Roles

| Role                  | Who                               | Behaviour                                                                                                                                    |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Writer / follower** | `primary` for class `calendar`    | Creates/updates/deletes Sharpit session events; on sync, schedule changes on those events update `PlannedSession` (move) or unlink (delete). |
| **Busy contributor**  | Any **enabled** calendar provider | Supplies busy intervals for coach / placement. Never creates Sharpit session events if not primary.                                          |

### Target calendar

- Each connected provider has a **write target**: one calendar id + display name.
- Google: already `GoogleAccount.targetCalendarId` / `targetCalendarName` — expose picker on **iOS** (API already lists calendars).
- Apple: store write target as EventKit `calendarIdentifier` (+ title) on device (and optionally mirror a preference on the server for display). Default: a Sharpit-owned calendar or the athlete’s default writable calendar — product default: **dedicated « SharpIt » calendar** (same as today) unless the athlete picks another **writable** calendar.

### Busy read set

- Google: all readable calendars (current server behaviour) or a future multi-select; v1 keeps current free/busy set.
- Apple: EventKit events from calendars the athlete allows (v1: all calendars with read access, excluding the write target’s Sharpit-owned events when computing “external” busy if needed to avoid treating own sessions as blocking — or include them as busy; **prefer include**: a placed session occupies the slot).

### Collision when both ON

1. Only `primary` may push/pull Sharpit events.
2. Switching primary: stop writing to the old provider’s events (leave orphan events or offer “remove from previous calendar” once — v1: **leave orphans**, stop updating them; new primary gets fresh writes for future sessions without an external id for that provider).
3. Disable secondary writer paths: remove / deprecate `PlanCalendarSync` as a standalone Settings toggle; Apple write only runs when `apple-calendar` (or `apple`) is primary for `calendar`.

---

## Information architecture (iOS)

1. **Sources de données**
   - Connect Google (existing) and **Calendrier Apple** (EventKit permission + link flag).
   - Remove or redirect **Paramètres › Calendrier de l’iPhone** → Priorités / détail Agenda.

2. **Priorités › Agenda**
   - Rows: Google Agenda, Calendrier Apple (when connected).
   - Toggle enable, tap for primary (same pattern as other classes).
   - Under each enabled provider: **« Calendrier d’écriture »** → list of writable calendars → save target.

3. **Plan / Coach**
   - Free-slot logic uses busy from all enabled calendar providers.
   - Session CRUD triggers write only to primary’s target calendar.

---

## Technical sketch

### Catalog / prefs

- Add integration id e.g. `apple-calendar` to class `calendar` alongside `google`.
- `CLASS_PRIMARY_PREFERENCE.calendar`: `['apple-calendar', 'google']` or keep Google first for web-only athletes.
- `loadConnectedIntegrationIds`: include `apple-calendar` when iOS has linked + granted EventKit (POST link similar to Apple Health).

### Google (gap fill)

- iOS: `GET /api/google/calendars` + `POST`/`PATCH` select target (reuse web handlers).
- No change to server push/pull rules beyond respecting primary: **if Google is not primary, skip push/pull** of Sharpit events; still allow free/busy if enabled.

### Apple (new)

- On-device module replaces `PlanCalendarSync` responsibilities when primary:
  - Write/update/delete events keyed by `sharpit://plan/session/<id>` (keep).
  - **Pull-back:** before overwriting from plan, if EventKit event for that URL has different start than server, **PATCH planned session** to match EventKit (calendar wins), then align. On delete in EventKit → unlink / clear start as with Google.
  - Busy export: upload busy intervals to API (e.g. `POST /api/v1/calendar/busy`) for coach server-side, **or** compute free slots on device for native coach only — **prefer upload busy** so web coach stays consistent.

### Server gates

- `provider-sync-gates` / cron Google sync: run write sync only if `primaryForClass(prefs, 'calendar') === 'google'`.
- Free/busy reads: any enabled provider that can supply busy.

### Pro / entitlement

- Today Apple copy is Pro-gated. Keep **writing** to external calendars as Pro; connecting + busy for placement may stay Pro too (match current). Confirm: same Pro gate as today’s Calendar sync.

---

## Migration

1. Athletes with `PlanCalendarSync.enabled`: treat as connected `apple-calendar`, target = existing SharpIt calendar id; set primary to `apple-calendar` if Google has no target, else leave prefs; disable legacy Settings toggle (migration once).
2. Athletes with Google target only: unchanged; primary stays Google when enabled.
3. Copy UX footers: Agenda ≠ Plan’s session list UI.

---

## Success criteria

- [ ] iOS can select Google write calendar among many.
- [ ] iOS can connect Apple Calendar, pick write calendar, set primary.
- [ ] With both enabled, only one Sharpit event per session (on primary’s calendar).
- [ ] Move/delete of that event updates Sharpit on next sync.
- [ ] Coach free slots see busy from enabled providers.
- [ ] Legacy « Copier mon plan » is gone or redirects; no double-write.

---

## Open points (resolve in plan if needed)

1. Exact integration id string: `apple-calendar` vs `apple` (prefer `apple-calendar` to avoid clash with `apple-health`).
2. Orphan events when switching primary: leave vs one-shot cleanup.
3. Whether busy upload is required in v1 for Apple or coach on iOS reads EventKit locally only.
