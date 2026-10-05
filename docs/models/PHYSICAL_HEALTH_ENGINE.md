# SHARPIT — Physical Health Engine (Phase 1)

> **Status:** Phase 1 (domain model and persistence) shipped. No inference engine — condition state is still declared, never inferred. Athlete surfaces and training guards now exist on top of it, see [ADR-037](../adr/ADR-037-injury-declaration-changes-training-retroactively.md).
> **Source of truth:** the athlete's declaration (`PhysicalNote` + check-ins). Each zone gets a training strategy (protect, progressive, correct, relapse watch) and a lifecycle (proposed resolution, relapse = new episode); `Condition` is kept in step by `syncConditionFromNote` on every write — see [ADR-068](../adr/ADR-068-a-declared-zone-has-a-strategy-and-a-lifecycle.md).
> **Code:** `src/core/physical-health/`, `src/lib/physical-health/`
> **Prisma:** `Condition`, `ConditionEpisode`, `ConditionObservation`, `FunctionalCapacity`, `ConditionKnowledge`
> **Domain context:** [`docs/domain/DOMAIN.md`](../domain/DOMAIN.md)

---

## 0. Purpose

The Physical Health Engine replaces the legacy Pain / Mobility / Posture system with a **persistent physiological memory** integrated into the Digital Twin.

It becomes a core physiological system alongside Recovery, Fatigue, and Adaptation.

**Phase 1 scope:** domain model, Prisma schema, legacy migration specification, tests, migration report.

**Out of scope (later phases):**

| Phase | Scope                                                         |
| ----- | ------------------------------------------------------------- |
| 2     | Inference engine, Digital Twin / Snapshot / Coach integration |
| 3     | Product surfaces (Biology hub first)                          |
| 4     | Personalized hypotheses (triggers, recovery duration)         |

**Delivered ahead of those phases, without an inference engine** ([ADR-037](../adr/ADR-037-injury-declaration-changes-training-retroactively.md)): declaration and re-assessment surfaces, a deterministic follow-up cadence, `functionalImpact` collected from the athlete, sensitive zones named in the coach prompt, a plan-gate rule on prescribed exercises, and a read-time audit of already-planned sessions. None of it infers condition state — it maps and checks what the athlete declared.

---

## 1. Core principles

1. **A pain score is never the state of an injury.** It is one observation among many.
2. **Condition state is inferred** from an evolving history of observations (Phase 2).
3. **The Digital Twin never forgets.** Resolved conditions remain in physiological history forever.
4. **Symptoms ≠ functional capacity.** Pain 2/10 + unable to run is a different situation than pain 7/10 + training completed.
5. **Deterministic, explainable, confidence-aware.** Never medical certainty. Never diagnosis.

---

## 2. Conceptual separation

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHYSICAL HEALTH ENGINE                       │
├─────────────────────────────────────────────────────────────────┤
│  ConditionObservation  →  evidence (point-in-time)               │
│  FunctionalCapacity    →  what the athlete can do                │
│  ConditionEpisode      →  recurrence episodes under one condition │
│  Condition             →  persistent physiological entity        │
│  ConditionKnowledge    →  personalized hypotheses (Phase 4)      │
│  ConditionTimeline     →  derived chronological view             │
│  InferredConditionState → engine output (Phase 2)               │
└─────────────────────────────────────────────────────────────────┘
```

| Layer               | Mutable by athlete?   | Written by engine?    | Deleted on resolve? |
| ------------------- | --------------------- | --------------------- | ------------------- |
| Observation         | Yes (manual check-in) | No                    | Never               |
| Functional capacity | Indirectly            | Phase 2 infers        | Never               |
| Episode             | No                    | Phase 2 infers        | Never               |
| Condition           | Label/diagnosis only  | Status/severity/trend | **Never**           |
| Knowledge           | Manual hypotheses     | Phase 4 infers        | Never               |

---

## 3. Domain entities

### 3.1 Condition

A **persistent physical condition** — localized (Achilles, knee) or systemic (global mobility, posture).

- `scope`: `LOCALIZED` | `SYSTEMIC`
- `type`: pain, injury, mobility limitation, posture, etc.
- `status`: inferred lifecycle (`NEW`, `ACTIVE`, `IMPROVING`, `STABLE`, `WORSENING`, `RESOLVED`, `RECURRENT`)
- `severity` / `confidence`: engine fields; seeded at migration from legacy data
- `legacyPhysicalNoteId`: idempotent migration link

Conditions are **never deleted**. `RESOLVED` is a status, not deletion.

### 3.2 ConditionEpisode

A recurrence under the same condition identity.

- Episode 1 is created at migration for each legacy `PhysicalNote`.
- Future episodes detected by Phase 2 engine when a resolved condition reactivates.

### 3.3 ConditionObservation

Point-in-time **evidence**. Never replaces condition state directly.

Key fields:

- `symptomPresent`: `false` when severity = 0 (asymptomatic moment, **not** resolution)
- `severityReported`: raw athlete-reported 0–10
- `functionalImpact`: `NONE` → `STOPPED`
- `context`: `MANUAL`, `AFTER_SESSION`, `MORNING_CHECKIN`, etc.
- `source`: `ATHLETE`, `SYSTEM_MIGRATION`, etc.

### 3.4 FunctionalCapacity

Separates **pain** from **training capacity**:

| painSeverity | trainingCapacity | Example                         |
| ------------ | ---------------- | ------------------------------- |
| 2            | `UNABLE`         | Pain low but cannot run         |
| 7            | `REDUCED`        | Pain high but session completed |

`TrainingCapacityLevel`: `FULL` | `REDUCED` | `LIMITED` | `UNABLE`

### 3.5 ConditionKnowledge

Structure for Phase 4 personalized hypotheses. **Not auto-populated in Phase 1.**

- `hypothesisType`: `TRIGGER`, `RECOVERY_DURATION`, `RECURRENCE_PATTERN`
- `isInferred`: false for manual entries; true only when Phase 4 has sufficient evidence
- `confidence`: `LOW` | `MEDIUM` | `HIGH`

### 3.6 ConditionTimeline

Pure derived view (`buildConditionTimeline`). Chronological union of:

- condition start
- episode start / resolve
- observations
- functional capacity snapshots
- knowledge entries
- status changes

---

## 4. Localized vs systemic taxonomy

### Localized examples

| bodyRegion      | type                         |
| --------------- | ---------------------------- |
| Achilles tendon | `PAIN`, `INJURY`             |
| Knee            | `PAIN`, `INSTABILITY`        |
| Shoulder        | `PAIN`, `DISCOMFORT`         |
| Lumbar spine    | `PAIN`, `MUSCULAR_TIGHTNESS` |

### Systemic examples

| bodyRegion              | type                       |
| ----------------------- | -------------------------- |
| Mobilité générale       | `MOBILITY_LIMITATION`      |
| Posture générale        | `POSTURE_ISSUE`            |
| Raideur musculaire      | `MUSCULAR_TIGHTNESS`       |
| Asymétrie fonctionnelle | `OTHER` (scope `SYSTEMIC`) |
| Qualité de mouvement    | `MOBILITY_LIMITATION`      |

Systemic scope is inferred when `bodyPart` matches patterns like `Général`, `Global`, `Posture`, or when type is mobility/posture without a localized body part.

---

## 5. Legacy mapping (Phase 1 migration)

| Legacy                                          | Destination                                                        | Rule                                              |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `PhysicalNote`                                  | `Condition` + `ConditionEpisode` #1                                | 1:1 via `legacyPhysicalNoteId`                    |
| `PhysicalCheckin`                               | `ConditionObservation`                                             | 1:1 via `legacyPhysicalCheckinId`                 |
| `PlannedSession.analysis.physicalReassessments` | observation `context`                                              | `AFTER_SESSION` when check-in date ≥ `analyzedAt` |
| `PhysicalNote.severity`                         | `Condition.severity` (initial) + first observation if no check-ins | preserved                                         |
| `PhysicalNote.status`                           | `Condition.status` + `Episode.status`                              | mapped (see below)                                |
| `PhysicalNote.description`                      | `Condition.diagnosis`                                              | preserved                                         |
| `PhysicalNote.affectsTraining`                  | `Condition.affectsTraining`                                        | preserved                                         |

### Status mapping

| Legacy `PhysicalStatus` | `ConditionStatus` | `EpisodeStatus` |
| ----------------------- | ----------------- | --------------- |
| `ACTIVE`                | `ACTIVE`          | `ACTIVE`        |
| `MONITORING`            | `STABLE`          | `STABLE`        |
| `RESOLVED`              | `RESOLVED`        | `RESOLVED`      |

### Severity 0 rule

`severity: 0` on a check-in → `symptomPresent: false`. This records **no symptom at that moment**, not condition resolution.

### Inferred at migration (not discarded)

- `scope` from type + bodyPart
- `confidence` from observation count (0 check-ins → 0.45, 1–2 → 0.6, ≥3 → 0.75)
- `functionalImpact` and `trainingCapacity` from severity heuristics (temporary; Phase 2 replaces)
- `recurrenceCount = 0` (no episode detection in Phase 1)

### Discarded

Nothing. Legacy tables remain for backward compatibility during transition.

---

## 6. Persistence

Prisma models in `prisma/schema.prisma`. Migration: `20260710_physical_health_engine_phase1`.

Data migration script: `scripts/migrate-physical-health-phase1.ts`

```bash
# Dry run (report only)
tsx scripts/migrate-physical-health-phase1.ts --dry-run

# Execute (idempotent)
tsx scripts/migrate-physical-health-phase1.ts
```

---

## 7. Medical safety (all phases)

The Physical Health Engine is **not a medical device**. It must never:

- diagnose
- prescribe treatment
- claim certainty

All estimates (recovery, recurrence, functional capacity, return to training) are **decision-support**, not medical advice.

---

## 8. Phase 2 — Inference Engine (implemented)

The Physical Health Model (`physical-health-v1`) infers latent condition state from observation history.

### Algorithm principles

| Signal                  | Method                                                                          |
| ----------------------- | ------------------------------------------------------------------------------- |
| **Severity**            | Time-decayed weighted average (half-life 7d) — not a naive mean                 |
| **Trend**               | Linear regression on symptomatic observations (14d), threshold ±0.3/day         |
| **Status**              | State machine: NEW → ACTIVE → IMPROVING/STABLE/WORSENING → RESOLVED / RECURRENT |
| **Functional capacity** | Latest `FunctionalCapacity` snapshot, else severity heuristic                   |
| **Confidence**          | f(observation count, recency, symptom/capacity agreement)                       |
| **Recurrence**          | Resolved condition + new symptomatic observation within 7d → RECURRENT          |

### Code

| File                                                 | Role                                          |
| ---------------------------------------------------- | --------------------------------------------- |
| `src/core/inference/physical-health/scoring.ts`      | Per-condition + aggregate inference           |
| `src/core/inference/physical-health/model.ts`        | `runPhysicalHealthModel()`                    |
| `src/core/inference/physical-health-orchestrator.ts` | Twin + DecisionRecord + Condition row updates |
| `src/lib/engines/physical-health-engine.ts`          | Production singleton                          |

### Integrations

- **Digital Twin:** `physicalHealthState` column
- **Athlete Snapshot:** `physicalHealth` field + fingerprint
- **Feature Engine:** `ConditionRepository` → `buildConditionHistory`
- **Coach Context:** reads Twin inferred conditions (fallback legacy `PhysicalNote`)
- **Inference order:** Physical Health runs before Recovery/Fatigue (updates Condition rows first)

### Phase 3 gate

Do not migrate product UI until Phase 2 is validated on real athlete data.

---

## 9. Phase 3 — Product surfaces (implemented, Biology first)

### Biology hub (`/biology`)

- Landing : `BiologyOverview` — navigation vers tous les systèmes dont **Santé physique**
- Corps : `/biology/body` — Composition + onglet **Suivi physique** (Condition Engine UI)
- Drill-down : `/biology/physical` — état inféré, timeline, historique résolu

### Presentation layer

| File                                                  | Role                                  |
| ----------------------------------------------------- | ------------------------------------- |
| `src/core/presentation/physical-health-view-model.ts` | ViewModel contract                    |
| `src/lib/presentation/physical-health.ts`             | Builder (Snapshot + Condition tables) |
| `src/app/api/presentation/physical-health/route.ts`   | API                                   |
| `src/components/physical-health/*`                    | UI components                         |

### Today (minimal)

- Frein limitant physique → lien `/biology/physical` quand `trainingBlockedByCondition`
- `navigationTargets.physical` dans TodayViewModel

### Still legacy (next iterations)

- Post-session `PhysicalReassessmentCard` → écriture directe `ConditionObservation`
- Décommission `GET /api/physical-notes` comme source primaire UI
- Drill-downs `/today/physical` (optionnel)

### Phase 4 gate

Personalized hypotheses only — not implemented in Phase 3.

| File                                                                 | Role                                   |
| -------------------------------------------------------------------- | -------------------------------------- |
| `src/core/physical-health/types.ts`                                  | Domain types                           |
| `src/core/physical-health/legacy-mapping.ts`                         | Legacy → domain transforms             |
| `src/core/physical-health/timeline.ts`                               | `buildConditionTimeline`               |
| `src/lib/physical-health/migrate-legacy.ts`                          | Migration bundles + report rows        |
| `src/core/physical-health/__tests__/physical-health-phase1.test.ts`  | Phase 1 tests                          |
| `docs/archive/migrations/PHYSICAL_HEALTH_PHASE1_MIGRATION_REPORT.md` | Detailed migration report (historical) |
