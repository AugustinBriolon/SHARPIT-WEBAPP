# Calendar providers — device smoke checklist

> **Status:** Manual — run on TestFlight / physical iPhone before shipping calendar-provider changes to production.
> **Related:** [Design spec](../specs/2026-10-08-calendar-providers-design.md) · [Implementation plan](../plans/2026-10-08-calendar-providers.md) · [ADR-074](../../adr/ADR-074-calendar-primary-writer-and-apple-calendar.md)

Automated coverage for Tasks 1–10 is in unit/integration tests (Vitest, Swift Testing). Those tests validate prefs, gates, busy merge, and client wiring — they **do not** replace on-device EventKit, Google OAuth, or calendar-app move/sync flows. **Device QA pending** until this checklist is executed by a human.

## Prerequisites

- [ ] Athlete account with **SHARPIT Pro** (external calendar write is Pro-gated).
- [ ] API database migrated through:
  - `20261008094101_apple_calendar_link` (`AthleteProfile.appleCalendarLinkedAt`)
  - `20261008130000_calendar_busy_snapshot` (`CalendarBusySnapshot`)
- [ ] **SHARPIT-WEBAPP** and **SHARPIT-APP** built from branch **`feat/calendar-providers`**, deployed or installed via TestFlight with that API.
- [ ] Google account connected (for Google scenarios); Apple Calendar permission granted when testing Apple (Settings → Sources → link Calendrier Apple).
- [ ] At least one planned session in Plan that can be placed or moved for sync verification.

## Scenarios

### 1 — Google only

- [ ] In **Priorités**, enable **Google Agenda** only; set it **primary**; pick a **write calendar** on iOS.
- [ ] Place or confirm a Sharpit session writes to that Google calendar.
- [ ] In Google Calendar (app or web), **move** the event to another time.
- [ ] Trigger sync (pull-to-refresh / foreground) → **Plan** reflects the new time.

### 2 — Apple only

- [ ] Enable **Calendrier Apple** only; **link** if prompted; set **primary**; pick write calendar.
- [ ] Place a session → event appears on the chosen Apple calendar.
- [ ] In **Apple Calendar**, move the event.
- [ ] Refresh Plan → session time **updates** to match Apple.

### 3 — Both ON, Google primary

- [ ] Enable Google + Apple; **Google = primary**; each has a write calendar selected (Apple write cal may exist but must not receive Sharpit writes).
- [ ] Place one session → **one event on Google** write calendar only.
- [ ] Add a busy block on Apple (non-Sharpit event) → free-slot / placement logic **still blocks** that slot (Apple busy upload).
- [ ] Confirm **no** new Sharpit event on the Apple **write** calendar.

### 4 — Both ON, Apple primary

- [ ] **Apple = primary**; Google still enabled.
- [ ] Place session → event on **Apple** write calendar; **Google write sync skipped** (no duplicate on Google).
- [ ] Google-side busy (if any) still contributes to slot blocking when enabled.

### 5 — Switch primary

- [ ] With events already on calendar A (previous primary), **switch primary** to the other provider.
- [ ] Existing events on A remain (**orphaned** — no auto-delete).
- [ ] New placements write **only** to the new primary’s write calendar.

## Sign-off

| Field        | Value                         |
| ------------ | ----------------------------- |
| Tester       |                               |
| Build / TF # |                               |
| Date         |                               |
| Result       | ☐ Pass · ☐ Fail (notes below) |

**Notes:**
