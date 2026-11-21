# ADR-138: The day timeline reads the clock

**Status:** Accepted
**Date:** 2026-11-21
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-137](./ADR-137-a-food-carries-the-time-it-was-eaten.md)

---

## Context

The athlete's remarks on « Fil de la journée » (`GET /api/v1/today` `timeline`), 2026-11-21:

1. A coffee noted at 13:00 read at 16:00. The journal keeps the day's caffeine as one total, with
   no time; the timeline stood it at a fixed hour.
2. A session done that morning sat at the foot of the rail with no time: sessions were sent with
   `minuteOfDay: null`, which sorts last.
3. A planned session was drawn as done before it was: the app filled every session's dot.

---

## Decision

1. **`AthleteDayJournal.caffeineMinute`** (`Int?`): when the day's last coffee was had, in minutes
   after local midnight, like a food's `eatenMinute` (ADR-137). The journal write (`PUT
/day-journal`) takes it: a time the athlete gives wins — a coffee noted late keeps its real hour;
   without one, a rise in the caffeine is a coffee had now, on today only (another day has no hour to
   assume); a lower total keeps the time; zero clears it (`nextCaffeineMinute`). The app sends now by
   default and lets the athlete change it. The timeline puts « Caféine » at that minute, else at
   16:00 as before.
2. **A session is placed at its start**: a done one at its activity's start in the athlete's zone
   (`athleteTimeZone`, the linked calendar's, else Paris) when that falls on the day and the
   activity was not typed by hand (a manual activity stores a day, not a clock); otherwise at its
   plan's `startTime`; neither leaves it unplaced.
3. **The timeline says a session's state**: `state: 'done' | 'planned'` on session events. Clients
   draw done only on `done`; a client before it reads `detail` (« Faite »).

The zone helpers (`lib/athlete-time-zone.ts`) are shared with the nutrition reading's session starts
(ADR-137).

---

## Consequences

- Hydration and mood keep their fixed hours: hydration is a running total and mood a morning
  check-in.
- Days noted before the column, and coffees added to another day without a time, read at 16:00.
