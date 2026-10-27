# ADR-115: Warm-ups are dosed by the session, stretches are targeted

**Status:** Accepted
**Date:** 2026-10-27
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-114](./ADR-114-endurance-sessions-carry-a-warm-up-and-stretches.md) (amended), [ADR-112](./ADR-112-every-endurance-plan-carries-two-strength-sessions.md)

---

## Context

ADR-114 gave every run, ride and swim the same routine per sport: six warm-up moves before a
recovery jog as before VO2 intervals, and five or six static stretches after every session,
justified as "reaching the goal without injury". Read against the primary literature:

- A warm-up improves performance (Fradkin 2010, McCrary 2015) when it rises with what the session
  asks; the part with the clearest effect before hard work, short fast efforts (potentiation), was
  missing unless the coach thought of it.
- Static stretching under 60 s per muscle costs almost nothing before a session (Behm 2016) — the
  library never did more.
- Stretching or an active cool-down after a session does not reduce soreness or injury (Herbert,
  Cochrane 2011; Van Hooren & Peake 2018). What lowers injury is strength work (Lauersen 2014),
  which the plan already carries twice a week (ADR-112).
- Nothing recorded whether a routine was done, so neither the athlete nor the coach could tell
  whether it mattered.

---

## Decision

1. **The warm-up is dosed by intensity** (`session-routines.ts`, RAMP order). Each sport's library
   is split into mobilise, drills and activate moves. RECOVERY takes two mobility moves,
   ENDURANCE all mobility, TEMPO adds the drills, THRESHOLD / VO2MAX / RACE add activation.
2. **Strides live in the prescription** (`endurance-potentiation.ts`, applied in
   `effectiveEndurancePrescription`). From TEMPO (run) or THRESHOLD (bike, swim), a repeat group of
   short efforts is carved out of the end of the opening warm-up step: run 2–6 × 20 s, bike 3–4 ×
   30 s high cadence, swim 4–6 × 25 m builds. The session keeps its length, and the screen and the
   watch get the same steps. Untouched when there is no warm-up step, when fewer than 5 easy minutes
   (200 m in the pool) would be left, or when the coach already wrote drills after the warm-up. The
   plan prompt asks for a single warm-up step of at least 15 minutes before hard work.
3. **Stretches are optional and targeted.** The cool-down routine is flagged `optional`, holds
   three stretches for the muscles the sport loads (none after RECOVERY), plus the declared zones'
   moves. A zone declared as an injury asks each of its moves to stay pain-free. Shown as
   « Étirements ciblés · facultatif », with no injury claim.
4. **Strength opens its first loaded lift with ramp-up sets** (50, 70, 85 %), written in that
   exercise's note (`STRENGTH_BLOCKS` guidance).
5. **The athlete says what they did.** `PlannedSession.warmupStatus` / `cooldownStatus`
   (`RoutineStatus`: DONE, SHORTENED, SKIPPED; null until said), written through the planned
   session PATCH and served on each routine. The iPhone drawer asks « Fait / Raccourci / Sauté »
   under the moves from the session's day on.
6. **The coach reads it beside the execution.** The session analysis gets the declared warm-up and
   is asked to tie a missed first block to it; the coach context counts the last 14 days' warm-ups
   (done, shortened, skipped, unsaid) under the realized sessions.

---

## Options considered

- **Keep one routine per sport (ADR-114 as is).** Simple, but doses a recovery jog like intervals
  and promises what stretching does not deliver.
- **Strides as a routine move, not a step.** No change to the prescription, but they would never
  reach the watch and the athlete would do them, or not, outside the session.
- **Lengthen the session for the strides.** Keeps the warm-up's easy minutes, but changes planned
  durations and loads the coach already balanced. Carving keeps them.

---

## Consequences

- A workout already sent to the watch before this change no longer matches its session's steps;
  it is re-sent only when the athlete asks.
- Adaptations (`/coach/adapt`) keep writing prescriptions as before; strides follow at read time.
- Whether warm-ups change first-block execution can now be read, session by session, by the coach;
  nothing yet charts it for the athlete.
- The library stays French copy in code (ADR-114).
