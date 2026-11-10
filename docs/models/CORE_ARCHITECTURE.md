# SHARPIT — Core Architecture

> **Status:** **FROZEN** — architectural constitution (2026-07-10)  
> **Phase:** Stabilization — vertical growth (experiences), not horizontal growth (new engines)  
> **Supersedes:** ad-hoc architectural decisions not documented here  
> **Related:** [`ARCHITECTURE.md`](../../ARCHITECTURE.md) (engineering conventions) · [`docs/domain/DOMAIN.md`](../domain/DOMAIN.md) (domain concepts) · [`docs/product/PRODUCT.md`](../product/PRODUCT.md) (product law)

---

## Purpose

This document defines the **permanent architectural foundations** of SHARPIT and distinguishes them from **future product evolution**.

The Core has reached sufficient maturity. From this point:

- **No new core engines** without explicit constitutional amendment.
- **Architectural growth is primarily vertical** — richer experiences built on frozen intelligence.
- **Horizontal growth** — new inference domains — requires justification against an existing athlete decision gap.

This is the **architectural constitution** for all engineering, design, and agent work going forward.

---

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL WORLD                                     │
│  Garmin · Strava · Manual entry · Weather providers · Health observations   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ sync / ingest
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OBSERVATION ENGINE                          [CORE]   │
│  Immutable evidence · provider snapshots · supersession semantics           │
│  Code: src/core/observation/ · src/infrastructure/observation/              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ raw records
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FEATURE ENGINE                            [CORE]   │
│  DayFeatures · session features · derived metrics from observations         │
│  Code: src/core/features/ · src/lib/engines/feature-engine.ts             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ features
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DIGITAL TWIN                              [CORE]   │
│  AthleteState cache · rebuildable from observations + decision records      │
│  Code: src/core/digital-twin/ · src/infrastructure/digital-twin/          │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ prior states (read-only between engines)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SPECIALIZED INFERENCE ENGINES                  [CORE]   │
│                                                                             │
│  Recovery ──► Fatigue ──► Adaptation                                       │
│  Physical Health ──► Environment                                           │
│                                                                             │
│  Each: Features + Twin context → pure model → Twin update + DecisionRecord │
│  Code: src/core/inference/{recovery,fatigue,adaptation,physical-health}/   │
│        src/core/environment/ + src/core/inference/environment/              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ stable engine outputs
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DECISION ENGINE                           [CORE]   │
│  Cross-model arbitration · single primary decision · evidence ranking       │
│  Code: src/core/decision/ · docs/models/DECISION_ENGINE.md                │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ DecisionState
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ATHLETE SNAPSHOT                           [CORE]   │
│  Immutable product aggregate · fingerprint idempotency                      │
│  Code: src/core/athlete-state/snapshot.ts                                 │
│        src/lib/athlete-state/snapshot-builder.ts                            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ serialized snapshot
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        [STABLE]   │
│  ViewModels · server-side builders · no physiological inference             │
│  Code: src/core/presentation/ · src/lib/presentation/                     │
│        src/app/api/presentation/                                            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ passive ViewModels
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCT SURFACES                       [EVOLVING] │
│  Today · Coach · Activity Detail · Biology drill-downs · Notifications     │
│  Widgets · PWA · Apple Watch (future)                                       │
│  Code: src/components/ · src/app/(app)/ · src/lib/coach-*.ts               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Runtime orchestration (today)

```
ApplicationOpened / SyncComplete / WellnessLogged
        │
        ▼
refreshAthleteState()                    [src/lib/athlete-state/orchestrator.ts]
        │
        ▼
loadTodayState()                         [src/lib/today-state-server.ts]
  1. Physical Health + Environment
  2. Recovery + Fatigue + Adaptation + Daily Strain (parallel)
  3. Decision Engine (sequential — after sub-models)
        │
        ▼
buildAthleteSnapshot()                   [src/lib/athlete-state/snapshot-builder.ts]
        │
        ▼
build*PresentationViewModel()            [src/lib/presentation/]
        │
        ▼
React components (render only)
```

---

## Layer Responsibilities and Boundaries

### Observation Engine — CORE (frozen)

**Answers:** _What was measured, when, by whom, with what quality?_

| May                                                    | May not                                   |
| ------------------------------------------------------ | ----------------------------------------- |
| Ingest, immutably store, supersede observation records | Infer physiological state                 |
| Preserve provider snapshots and payload hashes         | Apply business rules or product decisions |
| Expose observation repositories                        | Be bypassed as source of truth            |

**Code:** `src/core/observation/`, `src/infrastructure/observation/`, `src/lib/engines/observation-engine.ts`

---

### Feature Engine — CORE (frozen)

**Answers:** _What do observations mean in training context (per day, per session)?_

| May                                                       | May not                              |
| --------------------------------------------------------- | ------------------------------------ |
| Derive DayFeatures and session features from observations | Persist as canonical athlete state   |
| Apply deterministic extraction rules                      | Arbitrate across models              |
| Feed all specialized engines uniformly                    | Be consumed by Presentation directly |

**Code:** `src/core/features/`, `src/lib/engines/feature-engine.ts`

---

### Digital Twin — CORE (frozen)

**Answers:** _What is the current inferred state of the athlete across all dimensions?_

| May                                                                 | May not                                        |
| ------------------------------------------------------------------- | ---------------------------------------------- |
| Cache per-dimension engine outputs (RecoveryState, FatigueState, …) | Replace observation records as source of truth |
| Be rebuilt from observations + decision records                     | Allow engines to call each other directly      |
| Serve as read context for downstream engines                        | Expose raw observations to Presentation        |

**Code:** `src/core/digital-twin/`, `src/infrastructure/digital-twin/`

**Inter-engine rule:** Engines communicate **only through Twin state** (e.g. Fatigue reads RecoveryState from Twin; Adaptation reads Recovery + Fatigue + EnvironmentalImpact from Twin). Never direct engine-to-engine calls.

---

### Specialized Inference Engines — CORE (frozen)

**Answers:** One question each — domain-specific physiological inference.

| Engine              | Question                                                               | Code                                                        |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Recovery**        | Is the athlete ready to train today?                                   | `src/core/inference/recovery/`                              |
| **Fatigue**         | What is accumulated training load stress?                              | `src/core/inference/fatigue/`                               |
| **Adaptation**      | Is the athlete adapting to training stimulus?                          | `src/core/inference/adaptation/`                            |
| **Physical Health** | Do active conditions limit training capacity?                          | `src/core/inference/physical-health/`                       |
| **Environment**     | What environmental stress applies and how does it modulate physiology? | `src/core/environment/` + `src/core/inference/environment/` |

| May                                                                  | May not                                |
| -------------------------------------------------------------------- | -------------------------------------- |
| Consume Features + Twin context                                      | Consume Presentation types or UI state |
| Produce dimension state + DecisionRecord                             | Arbitrate across other engines         |
| Apply domain-specific overlay (e.g. EnvironmentalImpact on Recovery) | Make product-level verdicts            |
| Be rebuilt from observations                                         | Bypass Observation Engine              |

**Reasoning Engine** (`src/core/inference/reasoning/`) is a **projection adapter** — it delegates to Decision Engine and produces legacy `ReasoningState` for Twin backward compatibility. New work must not add arbitration logic here.

---

### Decision Engine — CORE (frozen)

**Answers:** _What is the single most important thing the athlete should understand right now?_

| May                                             | May not                                      |
| ----------------------------------------------- | -------------------------------------------- |
| Consume stable engine outputs only              | Consume raw observations or features         |
| Arbitrate limiting factors, conflicts, evidence | Perform physiological calculations           |
| Produce `DecisionState`                         | Be bypassed by product surfaces for verdicts |
| Rank and suppress redundant evidence            | Duplicate domain engine inference            |

**Code:** `src/core/decision/`  
**Spec:** [`DECISION_ENGINE.md`](./DECISION_ENGINE.md)

---

### Athlete Snapshot — CORE (frozen)

**Answers:** _What is the official athlete state at this moment for all product surfaces?_

| May                                                   | May not                                      |
| ----------------------------------------------------- | -------------------------------------------- |
| Aggregate inference outputs into one immutable object | Re-run inference                             |
| Project `DecisionState` into product fields           | Apply domain-specific scoring                |
| Fingerprint inputs for idempotent regeneration        | Be skipped by surfaces that re-fetch engines |

**Code:** `src/core/athlete-state/snapshot.ts`, `src/lib/athlete-state/`

**Canonical fields:**

- `decision` — **DecisionState** (product decisions)
- `reasoning` — legacy projection (deprecated for new surfaces)
- Per-engine data — drill-down context only

---

### Presentation Layer — STABLE

**Answers:** _How should intelligence be expressed to the athlete?_

| May                                                   | May not                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Map Snapshot / ViewModels to copy, layout, navigation | Perform physiological inference                      |
| Resolve i18n codes to human-readable strings          | Arbitrate cross-model decisions                      |
| Format numbers, dates, units for display              | Import `@/core/inference`                            |
| Build server-side ViewModels                          | Combine Recovery + Fatigue + Adaptation for verdicts |

**Code:** `src/core/presentation/`, `src/lib/presentation/`, `src/app/api/presentation/`

**Rule:** React components are **renderers only**. Business logic lives in server-side presentation builders.

---

### Product Surfaces — EVOLVING

**Answers:** _What does the athlete experience?_

| Surface                              | Status       | Notes                                                                                                                     |
| ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Today**                            | EVOLVING     | Primary Morning Experience — consume Snapshot                                                                             |
| **Coach (IA)**                       | EVOLVING     | Must migrate to Snapshot + DecisionState context                                                                          |
| **Activity Detail**                  | EVOLVING     | Environmental correction, narrative, storytelling                                                                         |
| **Biology drill-downs**              | STABLE       | Presentation API migration largely complete                                                                               |
| **PWA (install / offline / update)** | EVOLVING     | Install experience, safe SW updates, read-only offline Snapshot (ADR-008) — P0/P1 complete; no offline mutations, no push |
| **Notifications**                    | EXPERIMENTAL | Not yet built on Snapshot                                                                                                 |
| **Widgets / Watch**                  | EXPERIMENTAL | Future vertical expression                                                                                                |

---

## Architectural Status Matrix

| Subsystem                         | Status            | Rationale                                                                                                                                                                |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Observation Engine                | **CORE (frozen)** | Immutable evidence contract; Strangler Fig migration ongoing at edges only                                                                                               |
| Feature Engine                    | **CORE (frozen)** | Single extraction point; Tier 0–3 feature contract stable                                                                                                                |
| Digital Twin                      | **CORE (frozen)** | Inter-engine bus; schema changes require ADR                                                                                                                             |
| Recovery Engine                   | **CORE (frozen)** | v1 production; calibration changes via documented process only                                                                                                           |
| Fatigue Engine                    | **CORE (frozen)** | v1 production                                                                                                                                                            |
| Adaptation Engine                 | **CORE (frozen)** | v1 production                                                                                                                                                            |
| Physical Health Engine            | **CORE (frozen)** | v1 integrated; Twin + Snapshot wired                                                                                                                                     |
| Environment Engine                | **CORE (frozen)** | v1.1 contract frozen; calibration v2.6.1 frozen                                                                                                                          |
| Decision Engine                   | **CORE (frozen)** | v1 canonical; no new arbitration outside `src/core/decision/`                                                                                                            |
| Reasoning Engine                  | **STABLE**        | Projection only; no new synthesis logic                                                                                                                                  |
| Athlete Snapshot                  | **CORE (frozen)** | Product pivot; schema changes require quality gate                                                                                                                       |
| Presentation Layer                | **STABLE**        | ViewModel pattern established; finish migration                                                                                                                          |
| Today Experience                  | **EVOLVING**      | Vertical differentiation primary target                                                                                                                                  |
| Coach IA                          | **EVOLVING**      | Context builder migration in progress; coach/plan + coach/adapt proposals now pass through `src/lib/plan-gate/` (deterministic, non-Core) before returning to the client |
| Activity Environmental Correction | **EVOLVING**      | Phase 3 attribution; algorithm may refine                                                                                                                                |
| Environmental Exposure Duration   | **EXPERIMENTAL**  | Design only (`ENVIRONMENTAL_EXPOSURE_MODEL.md`)                                                                                                                          |
| Environmental Sensitivity Profile | **EXPERIMENTAL**  | Design only; no learning active                                                                                                                                          |
| Daily Strain                      | **STABLE**        | Feature-derived; not a full engine; document as derived metric                                                                                                           |
| Nutrition Engine                  | **EXPERIMENTAL**  | Not implemented; requires constitutional review before build                                                                                                             |
| Notifications / Widgets / Watch   | **EXPERIMENTAL**  | Future surfaces on frozen Core                                                                                                                                           |
| Legacy engine API routes          | **DEPRECATED**    | `/api/recovery`, `/api/fatigue`, etc. — remove                                                                                                                           |

---

## Permanent Engineering Principles

These rules are **non-negotiable** unless this document is explicitly amended.

### Source of truth

1. **Observations are the only source of truth.** Twin columns, snapshots, and cache are rebuildable derivatives.
2. **Every inference must be rebuildable** from observations.
3. **One DecisionRecord per athlete, model and training day** — a re-run replaces the day's record ([ADR-125](../adr/ADR-125-derived-tables-keep-the-current-state.md)).

### Engine boundaries

4. **Specialized engines never communicate directly.** All cross-engine context flows through Digital Twin.
5. **No new core engine** without demonstrating it answers an existing athlete decision gap not covered by Decision Engine + current engines.
6. **Architecture grows vertically before horizontally.** Express existing intelligence before adding models.

### Decision and product

7. **All product decisions come from `DecisionState`.** Surfaces must not synthesize verdicts from multiple engines.
8. **One primary decision per moment.** Cognitive load reduction is a product invariant.
9. **Safety before performance.** Decision Engine arbitration is safety-first (Physical Health > Fatigue > Recovery).

### Presentation

10. **No Presentation component performs business logic.** ViewModels are built server-side; components render.
11. **No React component imports `@/core/inference`.** Inference stays server-side.
12. **Surfaces consume AthleteSnapshot or Presentation ViewModels** — not Digital Twin directly, not raw engines.

### Quality and confidence

13. **Confidence gates advice.** Low-confidence states withhold actionable recommendations.
14. **Every output carries evidence + confidence.** No unexplained numbers on product surfaces.

### Environmental and health specifics

15. **Environmental engine does not leak weather to downstream models.** Only `EnvironmentalImpact` crosses the boundary.
16. **ActivityEnvironmentalCorrection explains; it never mutates raw metrics.**

---

## Future Evolution — Where Work Should Happen

Future differentiation comes from **expressing intelligence already available**, not from accumulating additional models.

### Primary (vertical — approved)

| Area                          | Direction                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| **Richer Today**              | Phase narrative, decision headline, environmental context, trust strip                              |
| **Coach conversations**       | Snapshot-grounded context; cite DecisionState evidence                                              |
| **Activity storytelling**     | Environmental correction narrative, coach verdict, records                                          |
| **Weekly reviews**            | Snapshot history + DecisionState trends                                                             |
| **Goal follow-up**            | Progress against goals using existing adaptation/recovery signals                                   |
| **Biology drill-downs**       | Deeper explanation, not deeper inference                                                            |
| **Installed-app PWA quality** | Manifest/identity, safe SW updates, install experience, read-only offline Snapshot — done (ADR-008) |

### Secondary (vertical — when Core migration complete)

| Area              | Direction                                               |
| ----------------- | ------------------------------------------------------- |
| **Notifications** | Push DecisionState primary decision + one evidence line |
| **Widgets**       | Snapshot subset; no engine calls on device              |
| **Apple Watch**   | Read-only complication from Snapshot API                |

### Not approved without constitutional review

| Area                               | Gate                                                |
| ---------------------------------- | --------------------------------------------------- |
| **Nutrition Engine**               | EXPERIMENTAL — requires decision-gap analysis + ADR |
| **Travel / Jet Lag Engine**        | EXPERIMENTAL — same                                 |
| **New scoring engines**            | Must not duplicate Recovery/Fatigue/Adaptation      |
| **Horizontal model proliferation** | Rejected by default in stabilization phase          |

---

## Architectural Review — Stabilization Status (2026-07-10)

Repository-wide stabilization sprints P0–P2 completed. The canonical product pipeline is enforced:

```
Decision Engine → DecisionState → AthleteSnapshot.decision → Presentation → Surfaces
```

### Confirmed conformant (post-P2)

- Observation → Feature → Twin → Engines pipeline operational
- Engines read peer state via Twin only (no direct inter-engine calls)
- Decision Engine is the single arbitration point for product verdicts
- Today, Coach context, drill-downs, and `useToday()` consume `snapshot.decision`
- React components do not import inference layer (CI guard)
- Legacy reasoning API routes removed; canonical client path is `/api/athlete-state/snapshot` + `/api/presentation/*`
- Deprecated helpers removed: `pickRecommendation`, `buildWhyEvidence`, `resolveConfidenceHref`, `resolveLimitingFactorHref`, `isAdviceActionable(reasoning)`, `productViewToTodayState`
- Presentation legacy pattern guard prevents reintroduction of parallel verdict paths

### Intentionally retained (temporary compatibility)

| Location                                                            | Why kept                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/core/inference/reasoning/` + `runReasoningModel()`             | Projects `DecisionState` → `ReasoningState` for Twin backward compatibility |
| `AthleteSnapshot.reasoning`                                         | Narrative projection on snapshot — not used for product verdicts            |
| `src/lib/today-state-server.ts`                                     | Server orchestration for inference pass (loads sub-models then decision)    |
| `src/core/decision/adapters.ts` → `decisionStateToReasoningState()` | Bridge for legacy Twin consumers                                            |

### Remaining structural debt (P3+)

| Location                                      | Issue                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/core/athlete-state/snapshot.ts`          | Types imported from `hooks/use-today.ts` (inverted dependency)                   |
| `src/lib/presentation/{effort,sleep,body}.ts` | Server-side analytics (PMC, sleep scoring) — candidate for product-insight layer |
| `src/app/(app)/training/[id]/page.tsx`        | Activity environment resolved inline, not via Presentation API                   |
| `src/components/analytics/analytics-view.tsx` | ViewModel built in component                                                     |
| `docs/EVENT_DRIVEN_ARCHITECTURE.md`           | Still references removed `/api/today` route                                      |

### Migration plan (historical → current)

| Phase  | Status      | Outcome                                                                                           |
| ------ | ----------- | ------------------------------------------------------------------------------------------------- |
| **P0** | ✅ Complete | Today + snapshot-phase + coach-context → `snapshot.decision`                                      |
| **P1** | ✅ Complete | Drill-down global verdict strip; `useToday()` decision-first; deprecated helpers marked           |
| **P2** | ✅ Complete | Legacy API removal; dead helpers deleted; architecture guards extended                            |
| **P3** | Backlog     | Type ownership fix; analytics extraction; activity Presentation API; passive analytics components |

**Exit criterion for stabilization phase:** P0–P2 complete. Product-focused vertical work may proceed.

See [`docs/archive/models-process-2026/STABILIZATION_P2_REPORT.md`](../archive/models-process-2026/STABILIZATION_P2_REPORT.md) for the full audit.

---

## Amendment Process

Changes to **CORE (frozen)** subsystems require:

1. Written decision-gap analysis (why existing engines cannot answer the question)
2. ADR in `docs/adr/` or amendment section appended to this document
3. Explicit approval before implementation

Changes to **EVOLVING** surfaces require only conformance with the principles above.

---

## Related Documents

| Document                                                                         | Role                             |
| -------------------------------------------------------------------------------- | -------------------------------- |
| [`DECISION_ENGINE.md`](./DECISION_ENGINE.md)                                     | Decision Engine specification    |
| [`PHYSIOLOGICAL_INTERACTION_MATRIX.md`](./PHYSIOLOGICAL_INTERACTION_MATRIX.md)   | Cross-engine coupling reference  |
| [`ENVIRONMENTAL_CONTEXT_ENGINE.md`](./ENVIRONMENTAL_CONTEXT_ENGINE.md)           | Environment engine reference     |
| [`ENVIRONMENTAL_CALIBRATION.md`](./ENVIRONMENTAL_CALIBRATION.md)                 | Frozen environmental calibration |
| [`docs/ATHLETE_SNAPSHOT.md`](../ATHLETE_SNAPSHOT.md)                             | Snapshot contract                |
| [`docs/engineering/INFERENCE_PLATFORM.md`](../engineering/INFERENCE_PLATFORM.md) | Execution platform               |
| [`docs/product/PRODUCT.md`](../product/PRODUCT.md)                               | Product constitution             |

---

## Summary

SHARPIT Core is **complete and frozen**:

```
Observations → Features → Twin → Engines → Decision → Snapshot → Presentation → Surfaces
```

The intelligence stack exists. **The product phase is expression, not accumulation.**

Build vertically. Do not build horizontally.
