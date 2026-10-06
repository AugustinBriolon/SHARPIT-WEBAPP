# Competitive concepts — Bevel Help → Sharpit

> Sharpit-authored synthesis from the Bevel Knowledge Base scrape (`bevel-help/`, 2026-10-06).
> Competitor product names appear only for attribution. Do not ship Bevel wording to athletes.

## Why this map exists

Bevel’s public help centre is a clear **athlete-facing knowledge graph**: Strain, Recovery, Stress/Energy, Sleep, Fitness (Cardio/Muscular Load), Biology (confidence), Intelligence (coach capabilities and hard limits). Sharpit already owns stronger scientific engines; the gaps are mostly **vocabulary clarity**, **calibration honesty**, and **coach boundaries**.

## Concept map

| Competitor idea (paraphrased)                                   | Sharpit equivalent today                                                   | Sharpit opportunity                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Daily Strain vs Cardio Load (ATL/CTL on workouts only)          | Training Stress / PMC (CTL·ATL·TSB) + Fatigue                              | Keep the **day load** vs **training status** distinction explicit in coach copy and glossary |
| Recovery score from sleep + RHR + HRV + RR + SpO₂ + temperature | Recovery model + Decision Engine                                           | Already strong; improve athlete explanation via Session Rationale evidence                   |
| Seven load statuses including **Calibrating**                   | Cold-start notes in `confidence-scoring.md`; partial Gate data-sufficiency | Surface **calibrating** explicitly when history &lt; thresholds; refuse hard prescriptions   |
| Energy Bank (cumulative energy across days)                     | Digital Twin + Decision Memory outcomes                                    | Continuity via Decision Memory loop — not a new Core score in P0                             |
| Biological Age **Confidence** from data freshness/completeness  | `confidenceTier` on DecisionState                                          | **Enforce** inadequate confidence in Plan Gate (P0)                                          |
| Activity Status (Active / Sick / Injured / Break)               | Physical Health zones + profile constraints                                | Global day status remains a product lever                                                    |
| Intelligence: memory, check-ins, plans, hard “will not do” list | Coach + plan-gate + ADR medical disclaimer                                 | Publish Sharpit coach capability / non-goals next to Gate                                    |
| Nutrition Score / glucose impact                                | Nutrition coach reading (not an engine)                                    | Keep as reading layer; ground claims in logged food                                          |

## Knowledge-base structure to emulate (later)

Sharpit now ships its own athlete help centre at **`sharpit.app/aide`** (PR #149): 12 categories, 66 articles, search, static pages — content grounded in Core models and ADRs.

When extending that centre, keep clustering by athlete questions (scores, method, plan, coach, sources…). Competitive inventory for inspiration only: [`bevel-help/INDEX.md`](./bevel-help/INDEX.md).

Cross-check: help articles `methode/niveau-de-confiance` and `plan/garde-fous` must stay aligned with Plan Gate confidence enforcement (`knowledge/confidence-scoring.md`).

## Explicit non-copies

- Do not reimplement proprietary Strain scoring or Energy Bank formulas.
- Do not claim medical diagnosis (Bevel’s Intelligence “will not do” list matches Sharpit’s product law).
- Do not weaken Core frozen architecture for feature parity theatre.
