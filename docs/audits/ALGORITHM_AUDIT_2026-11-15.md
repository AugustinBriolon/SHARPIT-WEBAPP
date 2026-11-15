# Algorithm audit — pass 1 (2026-11-15)

Point-in-time audit, not product law. Scope of this pass: the foundation every other
engine reads — session load, rolling load, recovery scoring, and which signals reach
which engine. Not yet audited: fatigue, adaptation, reasoning and physical-health
scoring, decision arbitration, journal associations, nutrition reading, strength
proposals, race projection.

## Method

1. Read the formulas in `packages/core/src/features/extractors` and
   `packages/core/src/inference/recovery`, not the documents describing them.
2. Listed every derived signal and searched for a non-test reader.
3. Ran the recovery benchmark (`yarn core benchmark`).
4. Grouped the stored session features of one real athlete (447 sessions, 197 days of
   decision records) by load method. Read-only, aggregates only.

## What the evidence says

Session load per hour, by method, on real history:

| Sport    | Method (sessions)                                  | Load per hour      |
| -------- | -------------------------------------------------- | ------------------ |
| Run      | pace (59) / heart rate (47)                        | 108.6 / 50.9       |
| Bike     | power (78) / duration constant (56)                | 39.9 / 55.0        |
| Strength | duration constant (90) / heart rate (31) / RPE (4) | 35.0 / 11.5 / 20.0 |
| Swim     | duration constant (34) / heart rate (17)           | 65.0 / 48.6        |

206 of 447 sessions (46 %) are scored by duration × a sport constant.

Mean model confidence: recovery 0.46, fatigue 0.63, reasoning 0.68, adaptation 0.94.

## Findings, by impact

### F1 — The same session is worth 2–3× more or less depending on the sensor (critical)

The load of a session depends more on which tier scored it than on the session.

- **Run, pace tier: 108.6 per hour on average.** One hour at threshold is 100 by
  definition, so the average run cannot exceed it. The stored threshold pace is slower
  than the athlete's usual pace, and nothing checks it. `computePaceTss` accepts any
  intensity factor.
- **Strength: 11.5 per hour with a heart-rate strap, 35 without.** Heart rate does not
  describe mechanical load, and the TRIMP tier runs before the RPE tier, so wearing the
  watch divides a strength session by three and the athlete's own RPE is ignored.
- **Bike: the fallback constant (55) is above the measured mean (39.9)**, so a ride
  without power counts 38 % more than the same ride with it.
- **Swim: an untracked swim (65) counts more than a measured run (50.9).**

Everything downstream — acute and chronic load, ACWR, monotony, fatigue, adaptation,
the plan gate — sums these numbers. Adaptation's 0.94 confidence sits on top of them.

Fix direction: per-sport tier order (strength: RPE, then set volume, then duration;
never TRIMP); fallback constants calibrated on the athlete's own measured mean per
sport; reject an intensity factor above ~1.05 held for an hour as a stale threshold and
fall to the next tier. Then recompute history (`scripts/recompute-session-features.ts`).

### F2 — TRIMP uses the average heart rate (high)

`computeTrimpTss` applies the exponential weighting to the session's mean heart rate.
The weighting is convex, so intervals are under-scored against a steady session of the
same mean. `streamFeatureFields` already computes time in zones from the stream; the
load does not use it.

### F3 — The fitness/fatigue model the code refers to does not exist (high)

Comments in `load-extractor.ts` and `features/types.ts` defer to a "Training Stress
Model" producing CTL/ATL as exponentially weighted averages. There is none in
`packages/core`. All load reasoning runs on rolling sums:

- chronic load is `sum(42 d) / 6` whatever the history length, so an athlete with three
  weeks of data gets a chronic load halved and an ACWR doubled;
- acute load is inside chronic load (coupled ratio), which inflates agreement;
- `computeAcwrTrend` computes each past day's chronic load from the same 42-day window,
  so the day 13 days back sees only 29 days of history: early ratios are biased high and
  the trend biased downward;
- ACWR thresholds differ between `packages/core/.../recovery/scoring.ts`
  (0.8 / 1.0 / 1.3 / 1.5 / 1.8 / 2.0) and `packages/server/.../training-load.ts`
  (0.9 / 1.3 / 1.5), and a missing chronic load is `null` in one and `0` in the other;
- TRIMP is implemented twice (`session-extractor.ts`, `daily-strain.ts`).

### F4 — Heart-rate variability is read as a fixed percentage of one morning (high)

`computeHrvDelta` compares today's raw rMSSD to the 14-day mean, and
`mapHrvDeltaToAutonomicRaw` maps fixed percentage bands. Day-to-day variation of rMSSD
is commonly 10–20 % in raw units, so −10 % (score 55) is noise for one athlete and a
real signal for another. Practice (Plews, Buchheit): log-transform, 7-day rolling mean
against the athlete's own 60-day mean ± standard deviation. `hrvCoefficientOfVariation`
is computed and read by nothing.

The bands are also steps: −4.9 % scores 70 and −5.1 % scores 55. With the 0.35 weight a
0.2 % change moves readiness by 5 points and can flip the category.

### F5 — Sleep scoring depends on stage data and is diluted by naps (high)

- `computeSleepEfficiency` returns `null` without deep and REM minutes, so the sleep
  dimension is absent for any night without stages, however short the night. Duration
  only enters as a modifier of a score that is then missing.
- The Garmin adapter sets `totalMinutes = night + nap`, while deep and REM are the
  night's. A nap lowers the restorative ratio, so napping lowers the sleep score.
- The base score is the stage ratio alone. Wearable stage classification is the least
  reliable sleep measure; duration against need is the best-supported one.
- The field is named `sleepEfficiencyPercent` and holds a restorative ratio.

### F6 — Signals computed and read by nothing (medium)

`hrvCoefficientOfVariation`, `sleepOnsetConsistencyMin` (also wraps at midnight),
`sleepDurationTrend`, `energyBudgetRatio`, `chronicLoadRun`, `chronicLoadBike`.
`rpeVsTargetZone` compares the session RPE to a constant per sport, not to the planned
session's intended intensity, which the server holds.

### F7 — Nutrition reaches no engine (medium, needs a decision)

`fuel-extractor.ts` restates the day and stops ("that judgement belongs to an engine the
architecture has not approved"). No inference engine reads fuel features: a week at a
large deficit under high load changes neither readiness, nor fatigue, nor the plan. For
a digital twin the missing link is energy availability
(intake − exercise energy, per kg of fat-free mass), the documented path from
under-fuelling to illness, injury and stalled adaptation. `CORE_ARCHITECTURE.md` freezes
new engines, so this is a constitutional choice, not a bug fix.

### F8 — The benchmark cannot fail (medium)

`yarn core benchmark` scores 100/100 on 10 synthetic scenarios written against the
model's own thresholds. It checks that the code matches its specification, not that the
specification matches athletes.

## What would show a fix is right, without anyone's opinion

- Invariants as property tests: no session above 105 per hour for an hour; a session's
  load within ±25 % across tiers when two tiers are available; readiness continuous in
  each input (no jump above 3 points for a 1 % change); a nap never lowers the sleep
  score; ACWR undefined below 28 days of history.
- Retrospective checks on stored history: readiness of day D against the athlete's
  reported RPE and plan compliance on D; `DecisionRecord` outcomes already evaluated by
  `scripts/evaluate-decision-outcomes.ts`; race projection against run times
  (`scripts/backtest-race-projection.ts`); weight predicted from the logged energy
  balance against weigh-ins.

## Proposed order

1. F1, then recompute history — every other engine's audit is meaningless before it.
2. F5 nap dilution and duration, F4 continuity (interpolate between bands).
3. F3 one load implementation, one set of thresholds, history-length guard.
4. F2, F4 baseline, F6 wiring.
5. F7 after a decision on the frozen core.
6. Pass 2 of the audit on the remaining engines, on corrected load.

## Status after the first fixes (2026-11-15)

Done, each locked by a test:

- F1 — strength and yoga never use the heart-rate tier (RPE, then the sport constant);
  the pace and power tiers step aside when the intensity factor exceeds what the
  session's length allows (1.05 for an hour, 1.15 from 20 minutes, 1.3 below).
- F3 — the ACWR trend reads 56 days and skips a day whose own 42 days are incomplete.
- F4 — the HRV bands are linear between their centres; when the athlete has seven prior
  readings the score reads ln(rMSSD) in their own standard deviations (`hrvZScore`).
- F5 — the restorative ratio is over the night's own stages (naps no longer dilute it);
  the sleep score is half stages, half duration against the target
  (`sleepDurationRatio`), and duration alone when the night has no stages.

Not done:

- F1 — fallback constants calibrated on the athlete's measured mean per sport (the
  context provider would have to read stored features); strength scored on set volume.
- F2 — TRIMP from samples. `timeInZones` mixes heart-rate and power zones and carries
  no boundaries, so the stream analysis must emit a per-sample TRIMP first.
- F3 — one load implementation and one set of ACWR thresholds (the server's drive
  athlete-facing words: a product decision); a guard for short histories (the 42-day
  map is zero-filled, so a new athlete and a return from a break look the same).
- F6, F7, F8, and pass 2 on the remaining engines.

Stored history is unchanged until `scripts/recompute-session-features.ts` and the day
features are recomputed.
