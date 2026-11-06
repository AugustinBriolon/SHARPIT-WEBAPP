# ADR-121: A strength set is shaped as it is done

**Status:** Accepted
**Date:** 2026-11-06
**Author:** Augustin Briolon
**Related:** [ADR-040](./ADR-040-ios-product-canonical-api-v1.md), iOS ADR 0030

---

## Context

A strength prescription set (`strengthPrescriptionSetSchema`) carries `sets`, `reps`, `durationSec` and `weightKg`. The coach writes them, and several readers show them: the session breakdown (`session-steps.ts`), the summary line, and the iPhone's guided session.

Two shapes read wrong:

- **Stretches written as counts.** The coach sometimes writes a stretch as one rep at 0 kg, with no duration. The iPhone showed it as « 1 × 0 kg », a load of zero, for a hip flexor stretch that is a timed hold.
- **One-sided moves.** A lunge or a hip flexor stretch is done one side then the other, but nothing in the set says so. « 3 répétitions » then reads as two on one side and one on the other.

The movement taxonomy (`movement-taxonomy.json`) already knows both facts for the movements it lists: `modality: NONE` for a movement that takes no load, and `unilateral: true` for a one-sided one.

## Decision

- A set gains an optional `perSide`. When it is true, `reps` and `durationSec` are per side, and one set covers both sides. The coach is asked to declare it (`coachStrengthSetSchema`). When the coach is silent, the taxonomy's `unilateral` decides, and the coach's answer wins over the taxonomy.
- `shapeStrengthSet` puts a set in the shape it is done in:
  - no load (`weightKg: null`) for a mobility move, for a movement the taxonomy lists with `modality: NONE`, or for any set written at 0 kg;
  - a mobility move written as zero or one rep with no duration becomes a 30 s hold (`DEFAULT_MOBILITY_HOLD_SEC`, the routines' own length);
  - `perSide` filled from the taxonomy when the coach did not declare it.
- The shaping runs on write (`normalizeCoachStrengthPrescription`) and on read: the planned-session list and single GET, today's sessions and the breakdown go through `readStrengthPrescription` / `presentStrengthPrescription`. Sessions written before this change therefore read right without a migration. A stored value that does not parse is sent as it is, as before.
- The breakdown and the summary say « par côté » (« 3 × 30 s par côté »).
- The taxonomy gains the plural labels athletes use for the hip flexor stretch.

## Options considered

### Option A — Fix the display on each client

Pros: no server change. Cons: the iPhone, the web and the coach card would each guess « stretch » and « one side » again, and the taxonomy that already knows it would stay unused.

### Option B — Shape on write only, with a data migration

Pros: the read path stays a plain parse. Cons: it needs a migration of every stored prescription, and every set written by a path that skips normalization slips through.

### Option C — Shape on write and on read, with the taxonomy as fallback (chosen)

One function and one rule. Old rows are fixed where they are read. The coach can still override the taxonomy. Cons: a lookup per set on each read (an in-memory index); the stored JSON keeps its old shape until the session is written again.

## Consequences

### Positive

- A hip flexor stretch reads « 3 × 30 s par côté » everywhere, never « 1 × 0 kg ».
- The iPhone's guided session can chain both sides of a hold (iOS ADR 0030).

### Negative

- `perSide` is only as good as the coach's declaration and the taxonomy's 91 entries. An unlisted one-sided move that the coach does not flag stays unmarked.
- The watch export (Garmin) does not carry « per side »: the watch still counts one side.

### Neutral

- A mobility move with a real count (« 8 rotations ») keeps its count; only zero or one rep becomes a hold.

## References

- `packages/app/src/lib/planned-session/strength/strength-prescription.ts`
- `packages/app/src/data/movement-taxonomy.json`
- `packages/server/src/lib/planned-session/session-steps.ts`
