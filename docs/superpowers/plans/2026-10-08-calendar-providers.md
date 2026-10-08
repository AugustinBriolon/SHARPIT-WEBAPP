# Calendar providers (Google + Apple) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let athletes pick calendar provider + write calendar; only the primary writes/follows Sharpit sessions; enabled providers contribute busy for free slots; ship Google target picker on iOS and Apple Calendar as a peer provider.

**Architecture:** Data class `calendar` gains `apple-calendar` beside `google`. Source prefs `primary` is the sole writer/follower. Each provider stores a write-target calendar id. Google write/pull already lives on the API; gate it on primary. Apple EventKit runs on-device (link + busy upload + write/pull), replacing standalone `PlanCalendarSync`. iOS Priorités exposes enable/primary + write-calendar pickers.

**Tech Stack:** Prisma/`IntegrationId`, `PROVIDER_CATALOG` + source-prefs, Google Calendar API handlers, EventKit (iOS), SharpitClient v1 routes, Vitest + Swift Testing.

**Spec:** `docs/superpowers/specs/2026-10-08-calendar-providers-design.md`

## Global Constraints

- Integration id for Apple: `apple-calendar` (never `apple` — clash with `apple-health`).
- When both providers enabled: **only primary writes**; secondary busy-only.
- Switching primary: **leave orphan events** on the previous calendar; do not auto-delete.
- Writing to external calendars stays **Sharpit Pro** (same gate as today’s Plan calendar copy).
- English for code/docs/commits; French for athlete-facing copy.
- TDD: failing test before production code for each behavioural change.
- Do not double-write via legacy « Copier mon plan » once Apple is primary-capable.

## Decisions locked (were open in the spec)

1. Id = `apple-calendar`.
2. Orphans left on primary switch.
3. v1 Apple busy: **upload** intervals to the API so web coach and free-slot logic stay consistent.

## File map

| Area                        | Files                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog / prefs             | `packages/app/src/lib/integrations/provider-catalog.ts`, `source-prefs.ts`, `shared/client-sync.ts`                                                                  |
| Connected ids / gates       | `packages/server/src/lib/integrations/source-prefs-store.ts`, `cron/provider-sync-gates.ts`, `athlete-state/sync-providers.ts`, `integrations/google/google-sync.ts` |
| Apple link + busy API       | new handlers under `packages/server/src/handlers/v1/apple-calendar/`, routes in `apps/api`                                                                           |
| Schema                      | `packages/db/prisma/schema.prisma` — `AthleteProfile.appleCalendarLinkedAt`, optional JSON prefs for display                                                         |
| iOS                         | `SourcePrioritiesView`, new calendar picker, `PlanCalendarSync` → writer when primary, `CalendarSyncView` deprecate, link client                                     |
| UX polish (already drafted) | Google Agenda naming, Priorités check spacing, footers                                                                                                               |

---

## Lot 0 — Spec status + UX polish already started

### Task 0: Land Priorités / naming polish

**Files:**

- Modify: `packages/app/src/lib/integrations/provider-catalog.ts` (Google Agenda name + Agenda/nutrition descriptions — may already be local)
- Modify: `SHARPIT-APP/.../SourcePrioritiesView.swift`, `SourcePrefsStore.swift`, `ConnectionsView.swift`
- Modify: `packages/app/src/lib/landing/landing-copy.test.ts`

- [ ] **Step 1:** Confirm local diffs match: Google catalog name `Google Agenda`; Priorités primary mark not using stretched `Label`; Sources footer clarifies Plan vs Agenda.
- [ ] **Step 2:** Run `yarn test src/lib/integrations/provider-catalog.test.ts src/lib/landing/landing-copy.test.ts` in `packages/app` — expect PASS.
- [ ] **Step 3:** Commit WEBAPP + APP separately if both dirty:

```bash
# WEBAPP
git add packages/app/src/lib/integrations/provider-catalog.ts packages/app/src/lib/landing/landing-copy.test.ts docs/superpowers/specs/2026-10-08-calendar-providers-design.md docs/superpowers/plans/2026-10-08-calendar-providers.md
git commit -m "$(cat <<'EOF'
docs: add calendar providers design and plan

Also rename Google Calendar to Google Agenda in the catalog for Priorités.
EOF
)"
```

```bash
# APP
git add SHARPIT-APP/Features/Connections/SourcePrioritiesView.swift SHARPIT-APP/Features/Connections/SourcePrefsStore.swift SHARPIT-APP/Features/Connections/ConnectionsView.swift
git commit -m "$(cat <<'EOF'
fix: tighten Priorités primary control and Agenda copy
EOF
)"
```

---

## Lot 1 — Server: prefs, gates, Google write only if primary

### Task 1: Catalog + IntegrationId `apple-calendar`

**Files:**

- Modify: `packages/app/src/lib/integrations/shared/client-sync.ts` — add `'apple-calendar'` to `IntegrationId`
- Modify: `packages/app/src/lib/integrations/provider-catalog.ts` — add provider; `calendar` classes; status `available` for iOS link (web greys like Apple Health if needed via `coming_soon` + visible — prefer `available` with `authKind: 'none'`)
- Modify: `packages/app/src/lib/integrations/source-prefs.ts` — `calendar: ['google', 'apple-calendar']` preference order
- Test: `packages/app/src/lib/integrations/provider-catalog.test.ts`, `source-prefs.test.ts`

- [ ] **Step 1: Failing test** — expect `providersForClass('calendar')` to include `apple-calendar` and `google`.

```typescript
it('lists Google and Apple Calendar for calendar class', () => {
  expect(providersForClass('calendar').map((p) => p.id)).toEqual(
    expect.arrayContaining(['google', 'apple-calendar']),
  );
});
```

- [ ] **Step 2:** Run test — FAIL (provider missing).
- [ ] **Step 3:** Add catalog entry:

```typescript
{
  id: 'apple-calendar',
  name: 'Calendrier Apple',
  tagline: 'Depuis l’app iPhone',
  status: 'coming_soon', // web cannot link; iOS links — same pattern as apple-health
  classes: ['calendar'],
  integrationId: 'apple-calendar',
  authKind: 'none',
  dataTypesByClass: {
    calendar: ['Créneaux occupés', 'Disponibilités'],
  },
},
```

Update `CLASS_PRIMARY_PREFERENCE.calendar` to `['google', 'apple-calendar']` (or Apple-first on iOS later — keep Google first for web-primary athletes).

- [ ] **Step 4:** Tests PASS. Commit: `feat: add apple-calendar to provider catalog`

### Task 2: Connected ids + Apple link column

**Files:**

- Modify: `packages/db/prisma/schema.prisma` — `appleCalendarLinkedAt DateTime?` on `AthleteProfile`
- Create: migration `packages/db/prisma/migrations/YYYYMMDDHHMMSS_apple_calendar_link/migration.sql`
- Modify: `packages/server/src/lib/integrations/source-prefs-store.ts` — push `'apple-calendar'` when linked
- Create: `packages/server/src/lib/integrations/apple-calendar/apple-calendar-link.ts` (mirror `apple-health-link.ts`: set linkedAt + `enableProviderForAllCoveredClasses`)
- Create: handler + `apps/api/src/app/api/v1/apple-calendar/link/route.ts`
- Test: unit for link enable prefs

- [ ] **Step 1:** Migration SQL:

```sql
ALTER TABLE "AthleteProfile" ADD COLUMN "appleCalendarLinkedAt" TIMESTAMP(3);
```

- [ ] **Step 2:** Failing test — `loadConnectedIntegrationIds` includes `apple-calendar` when `appleCalendarLinkedAt` set (mock prisma).
- [ ] **Step 3:** Implement store + link helper + POST/DELETE or POST `{ linked: bool }` like Health.
- [ ] **Step 4:** Commit: `feat: link apple-calendar like Apple Health`

### Task 3: Gate Google write/pull on calendar primary

**Files:**

- Modify: `packages/server/src/lib/cron/provider-sync-gates.ts` (+ test)
- Modify: `packages/server/src/lib/athlete-state/sync-providers.ts` — skip Google session push/pull when primary ≠ `google`
- Modify: call sites that `syncFromGoogle` / push planned sessions to Google
- Keep free/busy reads when `google` is **enabled** even if not primary

- [ ] **Step 1: Failing test** in `provider-sync-gates.test.ts`:

```typescript
it('does not run Google write sync when calendar primary is apple-calendar', () => {
  expect(
    shouldSyncGoogleCalendarWrites({
      connected: true,
      targetCalendarId: 'cal-1',
      calendarPrimary: 'apple-calendar',
      calendarEnabled: ['google', 'apple-calendar'],
    }),
  ).toBe(false);
});

it('runs Google write sync when google is primary', () => {
  expect(
    shouldSyncGoogleCalendarWrites({
      connected: true,
      targetCalendarId: 'cal-1',
      calendarPrimary: 'google',
      calendarEnabled: ['google'],
    }),
  ).toBe(true);
});
```

- [ ] **Step 2:** Implement `shouldSyncGoogleCalendarWrites` and wire gates / sync-providers.
- [ ] **Step 3:** Freebusy path still called when google enabled — add assertion test.
- [ ] **Step 4:** Commit: `fix: write Google calendar events only when google is primary`

---

## Lot 2 — iOS: Google write-calendar picker

### Task 4: Native client for Google calendars + select

**Files:**

- Create/Modify: `SHARPIT-APP/Networking/V1GoogleCalendars.swift` (or extend SharpitClient)
- Endpoints: `GET /api/v1/google/calendars` (add v1 alias if missing — today `/api/google/calendars`) and `POST /api/google/select-calendar` (add `/api/v1/...` aliases per ADR-040)

- [ ] **Step 1:** Add v1 route re-exports if native only uses `/api/v1/*`.
- [ ] **Step 2:** Swift models:

```swift
struct V1GoogleCalendar: Decodable, Identifiable, Sendable {
    let id: String
    let summary: String
    let primary: Bool
    let isTarget: Bool
}
```

- [ ] **Step 3:** Test decode fixture JSON. Commit: `feat: native Google calendars API client`

### Task 5: Priorités UI — pick Google write calendar

**Files:**

- Modify: `SourcePrioritiesView.swift` — for `calendar` + provider `google`, NavigationLink / sheet to picker
- Create: `GoogleCalendarPickerView.swift`

- [ ] **Step 1:** When `sourceClass.id == "calendar"` and provider is google and connected, show subtitle with current target name or « Choisir un calendrier ».
- [ ] **Step 2:** Picker lists calendars; on select POST select-calendar; dismiss; refresh.
- [ ] **Step 3:** Manual check on device / TestFlight later. Commit: `feat: choose Google write calendar in Priorités`

---

## Lot 3 — Apple Calendar provider on device + busy upload

### Task 6: Busy upload API

**Files:**

- Schema: store latest busy blob or ephemeral Redis — prefer **Prisma JSON** on profile or small table `CalendarBusySnapshot(athleteId, provider, intervals Json, updatedAt)` for coach reads
- Create: `POST /api/v1/calendar/busy` body `{ provider: 'apple-calendar', intervals: [{ start: ISO, end: ISO }] }`
- Modify: coach free-slot / `getBusy` path to union Google freebusy + uploaded Apple intervals when enabled

- [ ] **Step 1: Failing test** — after POST, busy query returns those intervals for athlete.
- [ ] **Step 2:** Implement handler + merge in google-sync free-slot helper (extract `mergeBusyIntervals`).
- [ ] **Step 3:** Commit: `feat: accept apple-calendar busy intervals for free slots`

### Task 7: Refactor PlanCalendarSync into AppleCalendarWriter + pull-back

**Files:**

- Modify: `SHARPIT-APP/.../Plan/PlanCalendarSync.swift` → split or rename to `AppleCalendarSync`
- Behaviour changes:
  1. Only run **write** when prefs say `apple-calendar` is calendar primary (fetch source-prefs or cache from last Priorités load).
  2. Before applying plan → EventKit, for each existing event with Sharpit URL: if start differs from planned session, **PATCH** planned session schedule (calendar wins), then continue.
  3. If EventKit event missing but session had been written (track local map or detect via previous refresh), call unlink/clear equivalent on API if we store `appleCalendarEventId` — v1 may key only by URL and PATCH date/time from EventKit without server-side apple event id.
  4. Write target = selected `EKCalendar` id in UserDefaults (not only auto SharpIt calendar).
  5. Upload busy from all calendars (or all except none) after refresh.

- [ ] **Step 1: Failing Swift test** for planner URL + “EventKit start wins” pure function:

```swift
@Test func calendarMoveWinsOverPlanStart() {
    let planStart = date("2026-10-10T07:00:00+0200")
    let eventStart = date("2026-10-10T18:00:00+0200")
    let resolved = AppleCalendarPull.resolveStart(plan: planStart, event: eventStart)
    #expect(resolved == eventStart)
}
```

- [ ] **Step 2:** Implement resolve + PATCH client.
- [ ] **Step 3:** Wire refresh from RootView only when primary is apple-calendar and Pro.
- [ ] **Step 4:** Commit: `feat: Apple Calendar write and follow moves when primary`

### Task 8: Link Apple Calendar + picker in Priorités

**Files:**

- Modify: `ConnectionsView.swift` — row Calendrier Apple (request EventKit → POST link)
- Modify: Priorités — enable/primary + writable calendars list (EventKit)
- Deprecate: `CalendarSyncView` — redirect to Sources/Priorités or remove Settings entry; migrate `planCalendarSync.enabled` → link + enable apple-calendar once

- [ ] **Step 1:** On enable legacy flag, call link API + set defaults write calendar to existing SharpIt calendar id.
- [ ] **Step 2:** Settings: replace « Calendrier de l’iPhone » detail with « Gérer dans Sources › Priorités » NavigationLink.
- [ ] **Step 3:** Commit: `feat: connect Apple Calendar from Sources and pick write calendar`

### Task 9: Coach / free-slot uses merged busy

**Files:**

- Server paths that call `getFreeBusy` / list busy for coach tools
- Ensure enabled check for both providers

- [ ] **Step 1: Test** merge of Google + Apple intervals (overlapping collapsed or kept — keep simple concat sorted).
- [ ] **Step 2:** Wire. Commit: `feat: merge apple and google busy for session placement`

---

## Lot 4 — Docs + cleanup

### Task 10: ADR + help copy

**Files:**

- Create: `docs/adr/ADR-0XX-calendar-primary-writes-only.md` (or next number)
- Update: help article sources / agenda if present
- Update design spec status to Accepted

- [ ] **Step 1:** ADR: primary writer, secondary busy, Apple on-device, Pro gate.
- [ ] **Step 2:** Commit: `docs: ADR for calendar primary writer and Apple Calendar`

### Task 11: Smoke checklist (manual)

- [ ] Google only: pick write calendar on iOS; move event in Google → sync → Plan updates.
- [ ] Apple only: link; pick calendar; place session; move in Apple Calendar → refresh → Plan updates.
- [ ] Both ON, Google primary: one event on Google; Apple busy still blocks slots; no Sharpit event on Apple write calendar.
- [ ] Both ON, Apple primary: inverse; Google write sync skipped.
- [ ] Switch primary: old events orphaned; new sessions write to new primary only.

---

## Spec coverage check

| Spec requirement                     | Task                                |
| ------------------------------------ | ----------------------------------- |
| Choose provider + write calendar     | 5, 8                                |
| Google picker on iOS                 | 4, 5                                |
| Apple peer provider                  | 1, 2, 7, 8                          |
| Primary writes only                  | 3, 7                                |
| Secondary busy only                  | 3, 6, 9                             |
| Follow calendar moves                | 7 (Apple), existing Google + gate 3 |
| No double-write / retire copy toggle | 8                                   |
| Pro gate                             | 7, 8                                |
| Orphans on switch                    | 3, 7 (documented, no delete job)    |
| Busy upload Apple                    | 6                                   |

## Placeholder scan

No TBD steps; open product choices locked in Global Constraints / Decisions.
