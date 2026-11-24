# ADR-149: A change of intensity rewrites the session, not only its label

**Status:** Accepted
**Date:** 2026-11-24
**Author:** Augustin Briolon (with Claude Code)
**Related:** extends [ADR-017](./ADR-017-endurance-prescription-authoring.md) (the steps are the session); [ADR-121](./ADR-121-a-strength-set-is-shaped-as-it-is-done.md) (set shape)

---

## Context

An athlete accepted « Augmenter » on « Récupération 30min (10min échauffement - 15min recup -
5min retour au calme) ». The session's intensity moved to endurance, and nothing else did: the
title still said « Récupération », the 15 min main step kept `kind: 'recovery'` and no target,
so the description regenerated from it still read « 15 min récup », and the watch received the
same workout. The change had no effect on what the athlete would do.

Three gaps caused it:

- `rescaleEndurancePrescription` only retargeted a main step that already had a target; a
  recovery step with `metric: 'none'` kept both its kind and its missing target.
- Neither the morning recalibration nor the manual PATCH ever wrote the title.
- A strength session's sets, reps and loads were never touched; only prose was adapted.

---

## Decision

A change of intensity rewrites the session's execution, through one shared function,
`recalibratedStructure` (`packages/server/src/lib/morning-recalibration/recalibrated-structure.ts`),
called by the morning recalibration accept and by `PATCH /planned-sessions/[id]` whenever the
intensity changes without a change of sport.

- **Endurance steps**: main steps take the new intensity's default target, and a `recovery`
  step becomes an `interval` (work) step. Rest steps, warm-up and cool-down keep their role.
  The description is regenerated from the steps.
- **Strength sets**: `retargetStrengthPrescription` scales sets and load by the ratio of a
  per-intensity profile (recovery 0.7 sets / 0.6 load … VO2max 1 / 1). Reps, exercises and
  mobility holds are kept.
- **Title and free text**: `renameIntensityInText` replaces the old intensity's words with the
  new one (full label when it opens the text, short word inside). A title that never names the
  intensity — one the athlete chose — is left alone.
- **The athlete wins**: on a PATCH, the derived fields are spread before the patch, so a title,
  description or prescription written in the same edit overrides the rewrite.

---

## Options considered

### Option A — Rewrite the whole execution on every intensity change (chosen)

- Pros: the screen, the description and the watch all show the new session; one function for
  both entry points; deterministic and tested.
- Cons: a hand-tuned strength load is scaled by a fixed ratio; the profile is a heuristic.

### Option B — Rewrite only the title

- Pros: smallest change.
- Cons: what the user reported as the bug — the label changes and the workout does not.

### Option C — Ask the coach (LLM) to regenerate the session

- Pros: richer rewrites (new exercises, new interval shapes).
- Cons: latency, cost, non-deterministic, and a Pro-only path (ADR-097) for an action every
  athlete has.

---

## Consequences

### Positive

- A recovery run pushed to endurance reads and pushes as « 10 min échauffement · 15 min
  endurance · 5 min retour au calme » with an endurance pace band on the main step.
- A recovery strength circuit pushed to endurance gains sets and load (3 × 10 @ 40 kg → 4 × 10
  @ 50 kg).

### Negative

- A recovery step inside a structured endurance session is promoted to work; a session whose
  « recovery » step was meant as a between-efforts jog is only stretchable when made of time
  steps, so repeats are not affected (they are dropped and derived, as before).
- Renaming relies on a word list per intensity (FR + EN); a title naming the intensity with
  another word stays unchanged.

### Neutral

- The coach chat tool and scenario apply still write only the fields they name; they can adopt
  the same function later.

---

## References

- `packages/app/src/lib/planned-session/intensity-retarget.ts`
- `packages/app/src/lib/planned-session/endurance/endurance-rescale.ts`
- `packages/server/src/handlers/planned-sessions/[id]/handler.ts`
