# ADR-112: Every endurance plan carries two strength sessions a week

**Status:** Accepted
**Date:** 2026-10-26
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-005](./ADR-005-plan-safety-gate-placement.md), [ADR-068](./ADR-068-a-declared-zone-has-a-strategy-and-a-lifecycle.md)

---

## Context

In October 2026 the generator gave its own developer eight « Musculation » sessions totalling
4 h 22. Six were mobility fillers of 3 to 17 minutes; only two were structured strength work.

Two prompt rules produced that:

- the plan, adapt and chat prompts asked for « au moins une séance STRENGTH », and only when renfo,
  mobilité or étirements was among the practised sports. An athlete who ticked run alone never got
  any strength;
- nothing told a mobility filler apart from renfo, so a 10-minute stretch satisfied the rule.

Strength work is the one lever the plan has on tendon injury (heavy slow resistance, Beyer et al. 2015) and on running economy (Rønnestad & Mujika 2014). SHARPIT's promise is to reach the goal
without getting hurt.

---

## Decision

1. **Preventive strength for every endurance athlete.** `coachActivityTypesForPracticed` allows
   STRENGTH whenever an endurance sport is practised, ticked renfo or not. A strength-only athlete is
   unchanged.
2. **One dose rule, shared.** `formatStrengthFrequencyRule()` in `strength-session-template.ts` is
   injected in the plan, adapt and chat prompts: `WEEKLY_STRENGTH_TARGET = 2` structured sessions
   (≥ 35 min) a week, `LIGHT_WEEK_STRENGTH_TARGET = 1` in a recovery, taper or race week, none under
   a MOBILITY_ONLY/NONE trip or REST_ONLY capacity. Each session loads the sport's tendons
   (calves/Achilles, patellar and hamstrings for running; quads, glutes and lower back for cycling;
   rotator cuff and scapulae for swimming), progressing week to week, placed after an easy session or
   ≥ 6 h after a hard one, never the day before a key session.
3. **A plan-level gate rule checks it.** `strengthFrequencyRule` warns `STRENGTH_DOSE_LOW` for each
   Monday-to-Sunday week a whole-plan generation covers on at least five days. It counts structured
   proposals and existing structured sessions, asks for one in a TAPER/RACE plan week, and stays
   silent for targeted adaptations (no `planWindow`), strength-only athletes and REST_ONLY.

---

## Consequences

- Athletes who never ticked renfo now see strength sessions in their generated weeks.
- The warning is advisory: the generator is not re-run on it. The prompt is the main lever.
- Existing sessions planned before this change carry no duration check beyond `durationMin`;
  ones without a duration do not count toward the dose.
