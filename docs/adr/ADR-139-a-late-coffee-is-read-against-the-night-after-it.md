# ADR-139: A late coffee is read against the night after it

**Status:** Accepted
**Date:** 2026-11-21
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-138](./ADR-138-the-day-timeline-reads-the-clock.md)

---

## Context

The journal's habit analysis (`/api/v1/journal-analyses`) compares the nights after days with a
habit to the nights after days without. It read only yes/no factors: the day's caffeine, a total in
milligrams, never reached it, and the `coffee` factor is not one the athlete taps. Yet a coffee at
10:00 and one at 16:00 do not weigh the same on the night: caffeine's half-life is about five hours,
and sleep hygiene guidance keeps it more than eight hours before bed. Since ADR-138 the journal knows
when the day's last coffee was had (`caffeineMinute`), now by default and changed by the athlete for a coffee noted late.

---

## Decision

1. **A derived factor, `late_coffee` (« Café tardif »)**, set by the loader
   (`journal-habit-analysis-load.ts`, `lateCoffeeFactor`), never toggled:
   - `yes` when the day's last coffee was had less than eight hours before the bedtime of the
     night after it (`DailyHealth.sleepBedtimeMin` of J+1, a bedtime after midnight counted from the
     evening); without that bedtime, when it was had from 14:00 on;
   - `no` when the day had caffeine noted earlier than that;
   - nothing when the day had no caffeine or its coffee has no time on that day — a day without
     coffee is not an early-coffee day.
     So the contrast is late coffee against early coffee, which is the athlete's question.
2. Like every day factor it is read on the next morning's sleep, recovery and Body Battery (lag 1).
   It is a primary lever for sleep and a secondary one for recovery in the plausibility priors.

---

## Consequences

- The finding needs both kinds of days, at least four of each, before it shows: it appears after a
  few weeks of coffees noted on the day.
- Coffees noted before `caffeineMinute` existed, or added to another day without a time, stay out.
- Only the last coffee counts: two coffees at 08:00 and 16:00 make a late-coffee day, as they should.
