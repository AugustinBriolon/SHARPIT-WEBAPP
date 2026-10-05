# ADR-068: A declared zone has a training strategy and a lifecycle

**Status:** Accepted
**Date:** 2026-10-05
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (refines [ADR-037](./ADR-037-injury-declaration-changes-training-retroactively.md))

---

## Context

ADR-037 made a declared pain or injury an input to training. But it gave every open declaration
the same single consequence (never load the zone), and nothing ever closed one. Production data
for the main athlete on 2026-10-05:

- **Two pains read 0/10 since late August:** the sciatic nerve and the femoral biceps tendon,
  with 37 and 34 check-ins. Both were still `ACTIVE`, so every upcoming run was flagged
  `SENSITIVE_ZONE_LOADED` and the plan prompt still said never to load them. Nothing proposed
  closing them.
- **Three posture zones never reached generation:** rounded shoulders, duck feet and a
  retroverted pelvis. `sensitiveZonesFrom` kept `PAIN`/`INJURY` only, so the zones the athlete
  wanted _worked on_ changed nothing in the plan.
- **The newest note had no `Condition`.** Conditions were created once, by the Phase 1
  migration. The coach context preferred the snapshot's conditions over the notes, so it read
  stale statuses (`STABLE`) and missed that note entirely.
- **Status and severity did not change generation.** "Sous surveillance" behaved like "active",
  and the declared `functionalImpact` was stored only on the Condition's observations.
- **On iOS, zones were display-only.** They could be declared during onboarding and then
  appeared as raw lines in Santé's « À surveiller » (« Zone sensible : Genou / Tendinite »).
  They could not be followed up, edited or closed.

---

## Decision

**The athlete's declaration (`PhysicalNote` and its check-ins) is the source of truth. Each zone
gets a strategy derived from it, and a lifecycle the athlete moves through.**

### 1. Training strategy

`zoneStrategy` (`packages/app/lib/physical-health/zone-follow-up.ts`) is pure and evaluated on
every read:

| Strategy        | When                                                                                             | What the plan does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `protect`       | Open pain or injury that still hurts, or anything with severity ≥ 5, impact `LIMITING`/`STOPPED` | Never load directly (ADR-037's rule, gate warning kept)                                                      |
| `progressive`   | Under watch, or open but at 0/10 or impact `NONE`                                                | Loaded progressively: reduced volume, no plyometrics or heavy eccentrics, stepwise increase. No gate warning |
| `correct`       | Posture or mobility, open                                                                        | A target: every STRENGTH or MOBILITY session includes a corrective exercise for it                           |
| `relapse_watch` | Pain or injury resolved less than 42 days ago                                                    | No abrupt volume or intensity spike on it                                                                    |
| `none`          | `affectsTraining: false`, or resolved long ago                                                   | Not read by generation                                                                                       |

`formatZoneTrainingRules` writes one prompt block per strategy into plan and adapt generation.
`sensitiveZonesFrom` (gate rule, read-time audit, web chips) now keeps `protect` zones only, so
the gate and the prompt agree.

### 2. Lifecycle

- **Closing is proposed, never automatic.** `resolutionSuggested` is true when at least two
  readings cover ≥ 14 days and all of them say 0/10. Status-change points carry no reading and
  are skipped. The athlete confirms it, because resolving is a declaration.
- **Status changes are points on the timeline.** `PhysicalCheckin.status` records them
  (resolved, under watch, reopened). Reopening a resolved zone is a **relapse**:
  `recurrenceCount`, a new `ConditionEpisode`, and the `Condition` marked `RECURRENT`.
- **What the athlete can still do is stored.** `functionalImpact` lives on the note (the latest
  value) and on each check-in.

### 3. One reading everywhere

- Coach context, plan, adapt and the plan gate read the notes (`getTrainingZoneNotes`: open ones
  plus those resolved recently). The snapshot's conditions only stand in when nothing is
  declared.
- `syncConditionFromNote` keeps the Physical Health Engine's `Condition` in step on every
  create, update and check-in. The migration backfills the notes that never got one.
- `GET /api/v1/sensitive-zones` projects each zone for the app. It carries the strategy, the
  suggestion, relapses, the follow-up question owed, the upcoming sessions that load it, its
  timeline, and the body parts offered (all known to the region lexicon).
- `PATCH /api/v1/physical-notes/[id]` and `POST …/checkins` are the native twins of the web's
  routes.
- Santé's overview no longer lists zones in « À surveiller ». They have their own page.

---

## Options considered

### Option A: Strategy and lifecycle derived from the declaration (chosen)

- **Pros:**
  - A single pure function decides.
  - It is recomputed on read, so it is never stale.
  - It needs only three nullable columns.
- **Cons:**
  - The thresholds (14 days, 42 days, severity 5) are product judgment.

### Option B: Make the Physical Health Engine's `Condition` the source of truth

- **Pros:**
  - The engine already has episodes, observations and capacity.
- **Cons:**
  - The engine is part of the frozen Core.
  - Its statuses are inferred rather than declared.
  - Every client writes notes today.
  - Moving the writes would be a larger, riskier change for the same user-visible result.

### Option C: Auto-resolve silent zones

- **Pros:**
  - No athlete action needed.
- **Cons:**
  - It closes a zone the athlete may still feel, without saying so.
  - Resolving changes generation, so it must be the athlete's call.

---

## Consequences

### Positive

- The two silent pains stop flagging every run on the first read. They are proposed for closing
  on the iOS page and the web card.
- Posture zones now shape strength and mobility sessions.
- A relapse is visible (timeline, count, episode) instead of a duplicate note.
- The iOS app gains a full follow-up surface:
  - a list grouped by strategy;
  - a detail page with a curve, history and effect on the plan;
  - check-in, edit, monitor, resolve and reopen actions;
  - declaration from a body-part list the plan can check.

### Negative

- The thresholds have no evidence base: 14 quiet days, 42 days of relapse watch, severity ≥ 5
  protects. They are product judgment, like ADR-037's silence tolerances.
- `progressive` relies on the model honouring "reduced volume". Nothing checks it
  deterministically yet.
- A free-text body part (« Autre… ») is still accepted. The page then says that the plan cannot
  check it.

### Neutral

- `PhysicalCheckin` gains `status` and `functionalImpact`, and `PhysicalNote` gains
  `functionalImpact` (migration `20261005120000_sensitive_zone_follow_up`, which also backfills
  `Condition` rows).
- The region lexicon now lists « coude » before « cou », and every offered body part is under
  test.

---

## Review criteria

- If athletes resolve zones that come back within the watch window, lengthen it, or raise the
  quiet-run threshold.
- If `progressive` sessions are reported as aggravating, give the gate an INFO finding for them.
