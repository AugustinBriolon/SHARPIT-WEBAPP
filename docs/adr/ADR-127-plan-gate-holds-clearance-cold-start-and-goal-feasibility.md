# ADR-127: The plan gate holds clearance, cold start and goal feasibility

**Status:** Accepted  
**Date:** 2026-11-10  
**Author:** SHARPIT  
**Supersedes:** N/A  
**Related:** ADR-124 (health grounds catalog; intensity cap was prompt-only), ADR-081 (race finish projection), ADR-123 (wanted intensity and session count)

---

## Context

An audit of onboarding → plan generation found that several profile answers never reached
the model or the deterministic plan gate, and that no race target was ever challenged.

Without a watch, the first week is almost entirely those answers. Three holes mattered most:

1. ADR-124 already told the coach that a health-ground stage may owe a medical go-ahead, but
   `GateContext` did not carry the flag, so a pregnancy or vertebral-fracture athlete could still
   keep a VO2max session if the model ignored the prompt.
2. The weekly-load ceiling is recent load × ACWR. With no history it is 0 and the rule disables
   itself (`ceiling > 0`). The first onboarding week also had no macro-plan target, so the model
   chose the dose alone — including against a default CTL baseline of 40 when no PMC anchor exists.
3. `buildRaceProjection` already computes how far a target sits from the projected finish, but that
   result never entered the plan prompt. An unreachable time was planned for as if it were fine.

Separately, the plan prompt carried today's weather, today's nutrition and (when the week starts
tomorrow or later) today's day-verdict — none of which describe the seven days being written —
while age and sex were absent even though the thresholds line asks for estimates.

---

## Decision

1. **Identity in the plan context.** Add one line `Athlète : {age} ans, {femme|homme}.` from
   `birthDate` and `sex`. Height and weight stay out: no session changes with height; weight would
   need an extra read for a marginal effect (W/kg, impact).
2. **Plan-only context trim.** Generation uses a section filter: drop `environment` and
   `nutrition` always; drop `decision` when the week starts after today. Chat and session adapt
   keep the full context.
3. **Medical clearance in the gate.** `buildGateContext` sets `medicalClearanceOwed` from the
   health-grounds catalog. A new `medical-clearance` rule **rejects** any proposal above endurance
   (tempo included) while the flag is true, with an endurance safer alternative. This is the
   enforcement ADR-124 left as a follow-up.
4. **Cold-start weekly load.** When fitness is null and recent weekly load is 0, the plan target
   becomes `60 TSS × declaredSessionsPerWeek` (default 3). The same ceiling feeds the weekly-load
   gate as a **warning** (same severity as the existing overload rule). The constant is an estimate
   (~1 h steady endurance), not a measured baseline.
5. **Goal feasibility in the prompt.** For a `RACE` goal with a target time and a projection, the
   plan prompt gets the projected finish, range, confidence and a verdict
   (`within_reach` | `stretch` | `out_of_reach`) derived from existing `deltaSec` geometry. Out of
   reach: say so in the summary and calibrate sessions on the projected level, not the target.
   No new iOS screen — text only for now.

---

## Rationale

- Prompt-only rules for clearance already failed the audit's threat model; every hard medical
  constraint belongs in the gate, where it is unit-tested without a model call.
- A cold-start ceiling must not invent a PMC history. Bounding by the sessions the athlete asked
  for reuses ADR-123's declaration and keeps the gate's existing warn-don't-strip behaviour.
- Feasibility without history cannot invent a projection; beginners stay without a challenge until
  there is one. Reusing ADR-081 avoids a second estimator.
- Trimming today's weather/plate/verdict shrinks the prompt (the handler already documents that a
  long prompt made the model drop the schema) without starving chat of those reads.

---

## Alternatives Considered

### Alternative 1: keep adding rules only as prompt prose

**Pros:** No gate API change.

**Cons:** Same failure mode as ADR-124's open follow-up; each new sentence raises the schema-drop
risk the handler already hit.

**Rejected because:** Safety constraints that must hold when the model ignores instructions need a
deterministic reject path.

### Alternative 2: reject cold-start overloads instead of warning

**Pros:** Stronger first-week protection.

**Cons:** Diverges from the existing weekly-load rule and would strip sessions the athlete might
still want to keep after review.

**Rejected because:** Match the severity of the rule we are extending; raise later if first weeks
in production overshoot.

### Alternative 3: surface goal challenge on an iOS screen before generation

**Pros:** The athlete sees the conflict before any week is written.

**Cons:** Needs an UX decision and an app release; blocks the server-side fix.

**Rejected for now:** Prompt + summary first; screen is an explicit follow-up.

### Alternative 4: send weight (and height) into the plan context

**Pros:** Marginal help for impact and W/kg talk.

**Cons:** Extra query; height changes no session; weight without a clear dosing rule is noise.

**Rejected because:** Identity age/sex already unblocks zone estimates; more fields wait on a use.

---

## Consequences

### Positive

- A declared clearance-owed stage cannot keep a vigorous session through the gate.
- A watch-less first week has a non-zero load bound tied to the declared session count.
- An out-of-reach race time is named in the plan summary when a projection exists.
- Landing/help/SEO copy move from 15 to 16 guardrails to match the rule count a test asserts.

### Negative / limits

- Pregnancy stays capped at endurance for the whole declared stage: there is no
  « avis médical obtenu » field, so the ceiling lifts only by changing stage. Stricter than ACOG
  moderate-intensity guidance.
- Cold-start warns; it does not remove sessions. `60 TSS` per session is an estimate.
- No feasibility challenge without history; metric goals and « marathon in 3 weeks » week-count
  floors are still unchecked.
- Declared days / session-count mismatch is still unchecked (P1 from the audit).
- No persona / metamorphic bank for `/coach/plan` yet.

### Follow-ups left out on purpose

- Gate warning when session count or weekdays diverge from availability.
- Persona matrix and metamorphic assertions on the gate; optional hand-run LLM eval.
- iOS surface for the goal challenge; commits / TestFlight of the related app work.

---

## Review Criteria

- Revisit the cold-start constant when first-week adherence and load (ADR-102 window) are
  measurable for athletes with empty PMC.
- Revisit pregnancy severity when the product can record « cleared by a clinician ».
- Revisit prompt-only feasibility if coaches or support see athletes still chasing out-of-reach
  targets after the summary line ships.
