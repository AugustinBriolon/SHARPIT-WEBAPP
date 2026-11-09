# ADR-124: Health grounds are a sourced catalog

**Status:** Accepted  
**Date:** 2026-11-09  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

The iOS onboarding first offered « Ostéoporose », « Rétention d'eau » and « Cycle menstruel » as chips
that wrote free-text `OTHER` physical notes. The athlete's feedback: too few cases, no follow-up
question, and nothing told the coach how to adapt. For an athlete without a watch, these answers are
also most of what the coach knows before any data arrives. Conditions such as these have no single
body zone, so they do not fit `PhysicalNote` / `Condition`, which are built around a zone that hurts.

---

## Decision

Add `HealthGround {athleteId, key, stage, details?}` (unique per athlete and key), written as one set
through `PUT /api/v1/health-grounds` and read through `GET`. Keys, stages and the rules each stage
brings live in one catalog, `@sharpit/app/lib/health-grounds/catalog`. The iOS onboarding mirrors its
keys and stages, and so does the validator, which refuses a stage that is not the key's own. The coach
context gets a « Terrain de santé » section in every scope, built by `formatHealthGroundsForCoach`. A
stage that needs a medical go-ahead adds one line that caps intensity until the athlete confirms it.

The cases and their sources:

| Key             | Stages                                                | Source                                                       |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| osteoporosis    | osteopenia · osteoporosis · vertebral fracture        | UK consensus « Strong, steady and straight », BJSM 2022      |
| pregnancy       | trimester 1 · 2 · 3                                   | ACOG Committee Opinion 804 (2020)                            |
| postpartum      | < 6 weeks · 6–12 weeks · > 12 weeks                   | Goom, Donnelly & Brockwell (2019)                            |
| menstrual_cycle | regular · regular with symptoms · irregular or absent | McNulty et al., Sports Med 2020                              |
| diabetes        | type 1 stable · type 2 stable · recent hypoglycaemia  | Riddell et al., Lancet Diabetes Endocrinol 2017              |
| asthma          | controlled · not controlled                           | ATS guideline on exercise-induced bronchoconstriction (2013) |
| cardiovascular  | cleared · not yet cleared                             | PAR-Q+ / ACSM preparticipation screening                     |
| osteoarthritis  | mild · moderate · severe                              | ACR/Arthritis Foundation guideline (2020)                    |
| other           | declared (free text, athlete text in the prompt)      | —                                                            |

Water retention is no longer an entry of its own: it is a cycle symptom, logged in the journal.

---

## Rationale

- One catalog makes every rule reviewable, sourced and unit-tested, where free text left the model to guess.
- No phase-based cycle rules: the evidence shows a trivial effect and recommends an individual approach. Daily symptoms already come from the journal's `menstruation` factor, while an irregular or absent cycle is flagged as a possible energy deficiency (RED-S).
- `key` and `stage` are strings checked against the catalog, not Prisma enums, so a new case or stage is a catalog change and needs no migration.

---

## Alternatives Considered

### Alternative 1: physical notes with the stage in the description

**Pros:**

- No migration.

**Cons:**

- Free text the generator interprets loosely, nothing testable, and a body-zone model bent around conditions that have no zone.

---

## Consequences

- Health data: the grounds follow the injuries' consent path on iOS and are in the privacy export.
- The intensity cap is written into the prompt. Enforcing it in the plan gate is a follow-up.
- The `OTHER` notes the first onboarding version wrote (TestFlight builds only) are not migrated.
