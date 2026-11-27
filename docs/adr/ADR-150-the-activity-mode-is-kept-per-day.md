# ADR-150: The activity mode is kept per day

**Status:** Accepted
**Date:** 2026-11-27
**Author:** Augustin Briolon (with Claude Code)
**Related:** iOS ADR 0036 (the mode is a wheel)

---

## Context

The activity mode (Actif / En pause / Blessé / Malade) was one value per athlete,
`AthleteActivityStatus`, with `AthleteActivityStatusHistory` recording periods that always start
when the mode changes. In Résumé on iOS the mode's chip stays on screen when the athlete looks at a
past day. An athlete set « Malade » there, went back to today, set the mode again, and the past day
kept nothing: both writes had changed the current mode. No mode could be set for a day already
gone, so « combien de jours malade cette année » could not be answered either.

---

## Decision

The mode is read per day, and a past day can be set after the fact.

- `AthleteActivityStatusDay` (athlete, day, status; one row per day) holds a past day's mode set by
  hand. It never touches the current mode.
- A day's mode is: its `AthleteActivityStatusDay` row, else the history period still open when the
  day ends (capped by its `untilDate`), else `active` (`resolveActivityStatusDays`,
  `packages/server/src/lib/health/activity-status-days.ts`). Days are Europe/Paris, like
  `todayIsoDate`.
- `PUT /api/v1/activity-status` takes an optional `day`: a past day writes the row and answers
  `{ store, day }`; today or no day sets the current mode as before; a day still to come is a 400.
- `GET /api/v1/activity-status/days?from&to` answers each day's mode over at most 400 days.
- On iOS the chip and the drawer read and write the day Résumé shows; on today they still set the
  current mode.

---

## Consequences

- Yearly counts (days sick, injured, paused) can be read from the days endpoint; no screen shows
  them yet.
- The plan, the coach and the « jusqu'à » deadline still read the current mode only: setting a
  past day changes neither.
- The web drawer still sets the current mode only.
- The migration is additive (a new table); the privacy export includes it.
