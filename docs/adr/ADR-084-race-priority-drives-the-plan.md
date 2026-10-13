# ADR-084: Race priority (A/B/C) drives the plan

**Status:** Accepted
**Date:** 2026-10-13
**Author:** Augustin Briolon
**Supersedes:** N/A

---

## Context

`Goal.priority` (A/B/C) existed but barely mattered: the coach took the first A race as the
primary race, and the macro-plan (`generateMacroPlan`) and the AI week generation ignored B and C
races. An athlete with a Triathlon L in April (a step) and an Ironman in October (the target) got
a plan blind to the April race, or a plan built toward April if they picked it.

## Decision

**Semantics** (`packages/app/src/lib/goals/goal-priority.ts`):

- A « Objectif principal » — the plan is built toward it, full taper.
- B « Course étape » — mini-taper before, short recovery after, the build continues.
- C « Course d'entraînement » — no taper; the race is the week's hard session.
- `suggestPriority`: with no A within 12 months (`A_RACE_SEASON_MONTHS`), the longest race (then
  the farthest) is the A; any other race is a B, or a C when its expected effort is under 25 %
  of the season target's (`TUNE_UP_EFFORT_RATIO`). Expected effort = middle of the format's
  finish bounds (ADR-082 catalog).
- `seasonConflicts`: two A races less than 6 months apart (`A_RACE_MIN_GAP_MONTHS`).
- Goal payloads gain `priorityRole`, `priorityConsequence`, `seasonConflict`
  (`{ otherGoalId, otherTitle } | null`) and `suggestedPriority` (only when no priority is set).
  Existing fields are unchanged.

**Plan rules** (`packages/app/src/lib/training/periodization/periodization.ts`):

- A plan requested for a B/C race builds toward the nearest A race after it within its season;
  the plan's `goalId`/`raceDate` are that A's. Without such an A, the requested race stays the target.
- B/C races between today and the target are step races (`generateMacroPlan({ stepRaces })`):
  - B: 5 days at 65 % load before (−35 %), race day, 3 days at 40 % after. Each week's target
    load drops by the share of its days this takes away; its focus names the race.
  - C: no load change; the focus says it counts as the hard session.
  - The A race's own TAPER and RACE weeks are never modified.
- The AI week prompt (`handlers/coach/plan`) lists B/C races whose mini-taper, race day or
  recovery falls in the generated days as imperative constraints (`stepRaceConstraintLines`).
- The coach context lists each race with its role and date: the A as « cible du plan », B/C as steps.

## Consequences

- Stored plans stay valid: no schema change; the new behaviour applies to newly generated plans.
- Races with no priority are treated by their suggested priority in the plan.
- Two A races in one season are surfaced (`seasonConflict`), not resolved: the athlete decides.
