# ADR-079: SharpIt-native Energy Bank and Bevel-gap day scores

**Status:** Accepted
**Date:** 2026-10-12
**Author:** Augustin Briolon
**Supersedes:** N/A

---

## Context

Competitive analysis of Bevel (inventory via REA on the shipped iOS binary, plus public docs)
showed four day-score gaps SharpIt must close without copying proprietary Bevel weights
(FairPlay prevents recovering exact formulas):

1. **Energy Bank** — first-class intra-day cumulative battery (recovery + sleep + strain + stress).
2. **Stress surface** — expose Garmin daily stress on Today, not only inside Effort composition.
3. **Target strain band** — a daily low–high load window from recent recoveries and strain baseline.
4. **Sleep Needed** — enrich tonight’s duration beyond sleep debt alone (recent strain + efficiency).

SharpIt already has readiness synthesis (`runRecoveryModel`), soft Garmin Body Battery / stress
corroboration (`applyWearableEnergyCorroboration`), sleep debt (`computeDebtAndRecommendedDuration`),
and Effort strain 0–21. Body Battery must remain a corroboration input, never the product score.

---

## Decision

- Add a SharpIt-native **Energy Bank** model in `@sharpit/core` (`inference/energy-bank`),
  algorithm version `energy-bank-v1`, score 0–100, optional overnight carry (bounded),
  synthetic intra-day series when only daily inputs exist.
- Expose on **V1 Today** (optional fields for backward-compatible clients):
  `stress`, `energyBank`, and reuse Effort `targetBand` on Today when projected.
- Expose **`targetBand`** on **V1 Effort** (`below` | `within` | `above`).
- Expose **`sleepNeededMin`** on **V1 Sleep** as the enriched recommended duration, plus
  optional `sleepNeededContributors` for UI copy. Time-to-fall-asleep stays out of scope
  until SharpIt measures latency (documented shortcut).
- Do **not** replace `applyWearableEnergyCorroboration` on Recovery; Energy Bank is a
  separate product surface.
- Persistence: compute on read from existing `dailyHealth` + snapshot scores (no new table
  in v1). Rolling typical baseline uses recomputed recent closes.

---

## Options considered

### Option A — Elevate Garmin Body Battery as the Energy Bank

Fast, but SharpIt would sell a Garmin metric and stay unusable without Garmin Body Battery.
Rejected.

### Option B — Reverse Bevel’s Energy Bank weights

Blocked by FairPlay encryption; legally and product-wise undesirable. Rejected.

### Option C — SharpIt-native composite (chosen)

Documented, testable, calibrated on our readiness / debt / strain / stress; Body Battery
may influence Recovery only through the existing soft path.

---

## Consequences

### Positive

- Closes the largest Bevel product gap with an owned model.
- V1 optional fields keep older iOS builds decoding.
- Same core functions feed Today, Effort, Sleep, and coach context.

### Negative

- Intra-day series is coarse until we ingest stress/HR samples at higher resolution.
- Target band and Energy Bank will need athlete feedback to tune constants.

### Neutral

- `energy-bank-v1` / target-strain constants live next to the models; bump version when
  weights change so clients can show “recalculating”.

---

## References

- `packages/core/src/inference/energy-bank/`
- `packages/core/src/inference/target-strain/`
- `packages/core/src/inference/recovery/wearable-energy.ts`
- `packages/app/src/lib/sleep/sleep.ts`
- `packages/server/src/lib/presentation/v1/{today,effort,sleep}.ts`
