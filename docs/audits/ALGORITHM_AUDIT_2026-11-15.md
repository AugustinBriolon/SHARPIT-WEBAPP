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

# Pass 2 — the remaining engines (2026-11-15)

Read from the code only: no stored data was replayed in this pass. Not read: adaptation
and reasoning scoring, environment, the plan generator's prompts.

## Fatigue (`packages/core/src/inference/fatigue/scoring.ts`)

### G1 — Steady training reads as accumulated fatigue (critical)

`scoreLoadFatigue` is `ACWR / 1.5 × 100`. An athlete training exactly as usual
(ACWR 1.0) scores 67 on the heaviest dimension (weight 0.30), inside the band named
`ACCUMULATED` (61–75). The ratio also ignores the absolute load: 200 a week and 900 a
week score the same at ACWR 1.0. Fatigue is the acute load above the chronic one, not
their ratio alone.

### G2 — Yesterday's session does not exist the next morning (critical)

`features.sessions` holds the sessions of the training day being inferred. Metabolic
fatigue and the mechanical half of neuromuscular fatigue are therefore 0 every morning
before training and jump after the day's session. The day after a marathon the only
trace is the ACWR. The specification itself notes a 48-hour window "simplified" away.

### G3 — The best possible mood scores 50 points of psychological fatigue (high, bug)

`scoreFromMoodAndEnergy`: with both answers, `100 − (mood × 10 + energy × 10) / 2`, on
1–5 scales, so mood 5 and energy 5 give 50. With one answer the branch uses × 20 and
gives 0. An athlete who answers both questions is always at least half fatigued; one who
answers one is not.

### G4 — The accumulation counter feeds itself (high)

A day above 55 adds 7 points to the cumulative dimension the next day (capped at 70),
which keeps the index above 55. With G1 holding the load dimension at 67 in steady
training, the streak has no reason to break.

### G5 — Smaller defects

- `applyDissonanceBias` says it boosts load and neuromuscular; it only halves a
  confidence factor and leaves the score untouched.
- `estimateTimeToFresh` multiplies a score by a "half-life" linearly.
- The confidence per load method is declared twice with different values
  (`features/types.ts`: power 1.0, heart rate 0.75, pace 0.75, RPE 0.45; here 0.85,
  0.65, 0.5, 0.4).
- Sleep debt, the autonomic score and the ACWR each enter both recovery and fatigue, so
  the two engines agree by construction and the arbitration counts one cause twice.

## Sensitive zones (`packages/core/src/inference/physical-health/scoring.ts`)

### Z1 — A zero reading is thrown away (critical)

`saveCheckin` stores severity 0 as `symptomPresent = false`
(`packages/server/src/lib/queries/index.ts:536`), and `inferSeverityFromObservations`
averages symptomatic readings only. Pain 6 a week ago followed by three readings at 0
still averages to 6, until the last symptomatic reading leaves the 28-day window. The
same filter hides the improvement from `inferTrend`.

### Z2 — A flare is averaged away (high)

The severity is a decay-weighted mean. Readings 2, 2, 2 then 8 today give about 3.7:
`LIMITED`, not `UNABLE`. For an injury the latest reading must rule when it is the worst
— fast up, slow down.

### Z3 — To verify: the recurrence count

`inferRecurrentStatus` returns `recurrenceCount + 1` on every inference while a resolved
zone has a recent symptom, and the repository writes the result back. If nothing guards
it, one relapse counts once per daily run.

## Journal habits (`packages/app/src/lib/journal/journal-habit-statistics.ts`)

The soundest engine read: rank test, false-discovery correction, load adjustment. Two
limits: consecutive days are treated as independent (they are not, so the p-values are
too small), and the weekday is not controlled (weekend habits and weekend sleep move
together).

## Nutrition reading (`packages/server/src/lib/nutrition/analysis`)

Bands restate consensus and are in one module. Gaps:

- the carbohydrate band comes from the day's training minutes, not its intensity nor
  tomorrow's key session;
- the energy target is the profile's fixed figure plus the day's exercise energy; nothing
  checks it against the weight trend, which is the only ground truth for it;
- no energy-availability reading (see F7), no fat floor, no timing around the session.

## Strength proposals (`strength-session-template.ts`)

The template audits structure only: block shares, exercise count, estimated minutes.
Loads and progression are the language model's. Nothing reads the athlete's last and
best figures (`/api/v1/strength-exercises`), nothing enforces progressive overload, and
no rule ties the exercises to the open sensitive zones.

## Race projection (`packages/app/src/lib/goals/goal-race-projection.ts`)

Riegel from dated references, brick and open-water factors, a backtest script. Gaps: no
course elevation, no heat; the profile's threshold pace is a fallback input, and F1
showed that figure is stale for the athlete audited; the backtest covers one
half-distance race while the history holds five triathlons.

## Decision arbitration (`packages/core/src/decision`)

Safety order is explicit (zones, fatigue, recovery, environment, adaptation). Nutrition
is not a domain. The correlated inputs noted in G5 mean a single cause can outvote two
independent ones.

## Order for pass 2

1. G3 and Z1: plain bugs, small, each with one test.
2. Z2, then Z3 once verified.
3. G1 and G2 together: they need the per-day load history the F3 work already loads
   (acute minus chronic, and the last 48 hours of sessions).
4. G4 after G1, since G1 is what holds the streak.
5. Strength progression from stored figures; nutrition target against the weight trend.

## Status after the pass 2 fixes (2026-11-15)

Correction to F3: a fitness/fatigue model (CTL, ATL, TSB) does exist, in
`packages/app/src/lib/training/pmc`, read through
`packages/server/src/lib/training/pmc/pmc-server.ts` by the coach context, the plan gate
and the load screens. The finding stands in another form: the Core's recovery and fatigue
engines do not read it and run on rolling sums, so the athlete is described by two load
models that can disagree.

Done, each locked by a test:

- G1 — load fatigue is linear between knots; training as usual (ACWR 1.0) scores 35.
- G2 — the model carries half of yesterday's sessions and a quarter of the day before's
  (`sessionsWithCarryOver`, loaded by the fatigue orchestrator).
- G3 — mood and energy both at 5 score 0, both at 1 score 80. A dimension at 80 or more
  floors the index at 25, so one system at its worst is never `FRESH`.
- G5 — one table of confidence per load method; the dissonance comment says what the
  code does.
- Z1 — a reading at 0 counts as 0 in the severity and in the trend.
- Z2 — the severity is the larger of the decayed mean and the latest reading.
- Z3 — confirmed and fixed: the inference no longer adds one relapse per run.
- Strength — the plan generator receives the athlete's last and best figures per
  exercise with a progression rule (`formatStrengthHistoryBlock`).
- Nutrition — the reading receives the energy that held the athlete's weight over four
  weeks, from diary and scale (`estimateMaintenanceKcal`), to check the target against.

Not done:

- G4 — the accumulation counter still feeds itself; G1 removes what held it up in steady
  training, the loop itself is unchanged.
- G5 — `estimateTimeToFresh`; the inputs shared by recovery and fatigue.
- The strength history reaches the plan generator only, not the daily adaptation nor the
  chat coach. Nothing verifies that the generated loads follow the rule.
- Carbohydrate band by intensity and next day's session; energy availability; journal
  autocorrelation and weekday; projection elevation and heat; one load model for the
  Core and the coach.
- Zones already counted with an inflated relapse count are not repaired.

# Pass 3 — what the first two left (2026-11-15)

## Adaptation (`packages/core/src/inference/adaptation/scoring.ts`), read in this pass

### A1 — The interpolation helper did not interpolate (critical, fixed)

`lerp(min, max, rangeMin, value)` returned `min + clamp(value − rangeMin, 0, max − min)`:
it added the raw difference to the lower bound. A heart-rate drift meant to run from 100
down to 80 came out between 80 and 83; a readiness of 90 scored 80, one of 70 scored 50;
an ACWR of 2.5 scored 29 where 0 was meant; the detraining zone scored 0 or 1. Two tests
pinned the result as "known lerp behaviour". Replaced by a real linear map; the tests now
hold the intended values and two monotonicity properties.

### A2 — The autonomic score was not monotonic (high, fixed)

With HRV and resting pulse both known, an HRV up 8 % at a flat pulse scored 40, below an
unchanged HRV (60); so did any HRV between −10 % and −5 %. Both gaps now follow their
neighbours.

### A3 — Adaptation is read from one day (high, open)

The engine scores one morning's HRV and the day's own heart-rate drift. Adaptation is a
trend over weeks: the efficiency factor at a like effort, pace at a fixed pulse, the
weekly mean of HRV. `efficiencyFactor` is computed for every session and its trend is
read by nothing. The mean confidence of 0.94 has nothing behind it.

## Fixed in this pass, each locked by a test

- G4 — the accumulation streak is counted on each day's index without its cumulative
  dimension (`fatigueIndexWithoutCumulative`), so it cannot hold itself up.
- F1 — a session with nothing to be scored on takes the athlete's own mean load per hour
  for that sport, from at least five measured sessions of the last 180 days
  (`typicalLoadPerHour`), instead of a constant.
- Strength — the history block also reaches the daily adaptation. Not the chat coach:
  ADR-087 has it read strength on request, through a tool.
- Nutrition — the carbohydrate band rises with the day's training stress (80 → at least
  moderate, 150 → at least high), never below what the minutes give. The next day's
  session was already in the reading's inputs.
- Journal — a weekend morning is brought back to the weekday level before habits are
  compared (`weekendAdjuster`).
- Zones — `apps/api/scripts/repair-recurrence-counts.ts` resets each count to its
  episodes minus one; dry run unless `--apply`. Not run.

## Found in passing, open

- `AthleteContextProvider.fetchRestingHr` reads the latest resting pulse whatever the day
  being extracted, so recomputing an old session scores it on today's pulse: history is
  not reproducible.
- `loadDaySessions` in the nutrition reading takes `Activity.load`, the column ADR-011
  says mixes Garmin's stress with its EPOC load, not the Core's figure.

## Still open

- F2 per-sample TRIMP; strength load from set volume.
- One load model for the Core and the coach; the ACWR thresholds; short histories.
- F6 the unread signals; A3; `estimateTimeToFresh`; inputs shared by recovery and fatigue.
- F7 energy availability, which needs a decision on the frozen Core.
- F8 a benchmark that can fail: it needs outcomes from stored history.
- Journal autocorrelation; projection elevation and heat; a check that generated
  strength loads follow the progression rule.
- Reasoning and environment engines: not read.

# Pass 4 — open points taken up (2026-11-15)

Fixed, each locked by a test:

- F2 — the heart-rate tier sums TRIMP sample by sample when the session has a stream
  (`sampledTrimpTss`, carried as `stream.hrTrimpTss`); a gap above 30 s between samples
  is a pause. The mean-pulse formula remains for sessions without a stream.
- A3 — adaptation reads the efficiency factor over two four-week windows
  (`efficiencyTrendPercent`): ±3 points per percent, capped at ±5 %, and the dimension is
  scored on the trend alone when no session carries a drift. Correction to A3: the drift
  was already a 14-day mean, not one day's.
- Reproducible history — the resting pulse given to the extractors is the one known on
  the day extracted, not the latest.
- Strength — the plan gate flags a prescribed load more than 5 % above the athlete's best
  (`STRENGTH_LOAD_ABOVE_BEST`, a warning, beside the completeness rule so the landing's
  count of guardrails stays true).

Still open:

- Strength load from set volume; one load model for the Core and the coach; the ACWR
  thresholds; short histories.
- F6 the unread signals; `estimateTimeToFresh`; inputs shared by recovery and fatigue.
- F7 energy availability (decision on the frozen Core); F8 a benchmark that can fail.
- Journal autocorrelation; projection elevation and heat; the nutrition reading still
  takes `Activity.load`.
- Reasoning and environment engines: not read.

# Mobility pass (2026-11-15)

The athlete's report: a mobility session comes out as a joint warm-up.

Cause, in three places:

- the strength template named its opening block « Mobilité / activation » and described
  it as « mobilité articulaire », so the generator learnt that circles and swings are
  mobility;
- nothing said what a mobility session is: no target joints, no time under stretch, no
  end-range work;
- the iPhone called the warm-up routine before an endurance session « Mobilité avant ».

Fixed:

- the block is « Réveil articulaire / activation », described as preparation;
- the generator's rules define warm-up, mobility and cool-down stretching as three
  things, and a mobility session as one or two preparation moves then range work on two
  or three joints, each exercise 60 to 120 s under tension per side, with a measurable
  landmark in its note (`MOBILITY_SESSION_RULES`);
- the plan gate warns when under half of a mobility session's exercises hold at least
  60 s (`auditMobilitySession`, `MOBILITY_SESSION_IS_WARMUP`);
- the iPhone reads « Échauffement et étirements » and « Échauffement avant ».

Limits: the check reads time under stretch, the only signal a prescription carries; it
cannot tell an end-range hold from a comfortable one. Sessions already generated keep
their exercises. The intent `MOBILITY` still covers stretching, self-massage and range
work alike.

# Pass 5 — reasoning and environment (2026-11-15)

## Reasoning (`packages/core/src/inference/reasoning/scoring.ts`)

### RS1 — Detraining was read as a reason to rest (high, fixed)

`mapAdaptationDirection` sent `DETRAINING` to `REST`, beside `MALADAPTING`. Detraining
is too little load. An athlete back from a break — rested, fresh, detrained — therefore
met the conflict rule "fatigue says train, adaptation says rest" and was answered
`CAUTION`. It now reads `TRAIN`; one test holds the direction, one the verdict.

### RS2 — Open

- `TRAIN_HARD` needs a fatigue level of `FRESH` or `FUNCTIONAL_LOW` (index ≤ 40). With
  the load dimension at 67 in ordinary training (G1), that verdict was close to
  unreachable for a steadily training athlete. G1 is fixed; how often the verdict is now
  reached can only be read from stored history.
- `PLATEAUING` reads `EASY`. A plateau calls for a different stimulus, not for less.
- `RACE_READY` is answered whenever the adaptation peak is within five days, whether or
  not a race is near.
- The verdict is a cascade over categories: one point across a band edge changes the day.

## Environment (`packages/core/src/environment`)

Skimmed, not audited line by line: applicability and availability are explicit, the
thermal reading uses heat index and wet-bulb globe temperature, acclimatisation has its
own calibration. Nothing found at that depth.

## Not attempted, and why

- One load model: the fitness/fatigue model lives in `packages/app`, which the Core
  cannot import, and needs the whole history where the extractors read 56 days. Moving it
  is a design decision, not a fix.
- A benchmark that can fail, the before/after replay, the recomputation of history and
  the repair of relapse counts all need the production database.

# In production (2026-11-15)

Pushed and deployed, then the session features of one athlete recomputed twice (392
sessions each time, none failed). Load per hour of the latest features, read by
`apps/api/scripts/inspect-session-load.ts`:

| Sport    | Method         | Before     | After     |
| -------- | -------------- | ---------- | --------- |
| Run      | pace           | 106.0 (59) | 93.3 (55) |
| Run      | heart rate     | 50.3 (47)  | 54.8 (47) |
| Bike     | power          | 41.2 (78)  | 40.3 (80) |
| Strength | heart rate     | 12.2 (31)  | none      |
| Strength | RPE            | 25.4 (4)   | 40.1 (31) |
| Strength | sport constant | 35.0 (90)  | 34.9 (94) |
| Swim     | heart rate     | 51.3 (17)  | 58.5 (17) |

The relapse counts needed no repair: 7 zones read, none wrong.

## What the recomputation uncovered

### P1 — History was rescored on today's thresholds (critical, fixed)

The first pass raised power-scored rides from 41.2 to 55.2 per hour. The extraction
context read FTP, threshold pace and LTHR from the profile, and the profile's FTP had
gone from 207 W in August to 170 W that day: every ride was rescored on 170 W, by the
square of the ratio. `thresholdAsOf` now reads each threshold from
`AthleteThresholdSnapshot` as it stood on the day; the second pass restored 40.3.

### P2 — The threshold estimator only ever walks down (high, bounded)

Estimates come from the best efforts of a 120-day window. Without an all-out effort the
window's best falls while the athlete loses nothing: 207 → 188 → 170 W in three months.
A downward revision is now bounded to 5 % of power and 3 % of pace per revision
(`boundDownwardRevisions`). The stored values are untouched: whether 170 W is right is
the athlete's call. Run pace still scores 93 per hour against 55 for heart rate, the
same symptom on the running threshold.

### P3 — Removed sessions kept their load (critical, fixed)

447 sessions had features, 392 had an observation. Nothing ties a feature set to its
observation, so when a duplicate session is removed its features stay and
`findSessionFeaturesByRange` kept returning them: 55 phantom sessions, 2 225 points of
load, 41 of them in the last 56 days. The repository now leaves out a feature set whose
observation is gone. The rows themselves are not deleted.

## Not done

- A replay of readiness against the next day's outcome: it needs an outcome defined
  first (reported RPE, compliance), which is a decision, not a query.
- The stored verdicts of past days are unchanged: nothing replays them.
