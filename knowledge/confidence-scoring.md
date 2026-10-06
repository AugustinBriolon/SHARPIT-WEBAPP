# Confidence Scoring

> How SHARPIT quantifies certainty in its outputs. Framework for degrading gracefully when data is incomplete, stale, or low quality.

---

## Why Confidence Scoring Matters

SHARPIT's outputs are only as good as the data feeding them. The same output text ("Bien récupéré : séance intense possible") can be:

- Highly reliable: 30 days of excellent HRV, readiness 85, sleep 8h average, ACWR 1.1
- Speculative: 3 days of data, no HRV, readiness not measured, inferred from TSB alone

Without confidence metadata, the athlete cannot distinguish these cases. Confident-sounding language from weak data is misleading and potentially dangerous.

---

## Confidence Dimensions

Each recommendation or metric output in SHARPIT carries implicit confidence from four independent sources:

### 1. Data Completeness

What fraction of required inputs is present?

| Level        | Completeness | Description                                     |
| ------------ | ------------ | ----------------------------------------------- |
| Full         | 100%         | All required signals present                    |
| Partial      | 50-99%       | Some signals missing; primary signal present    |
| Minimal      | 25-49%       | Major gaps; outputs should be clearly qualified |
| Insufficient | <25%         | Cannot support meaningful recommendation        |

### 2. Data Recency

How fresh is the data?

| Level   | Age       | Description                      |
| ------- | --------- | -------------------------------- |
| Current | ≤24 hours | Today's data or yesterday's      |
| Recent  | 1-3 days  | Still representative             |
| Aging   | 3-7 days  | Decreasing relevance             |
| Stale   | >7 days   | Should not drive recommendations |

### 3. Model Validity

How well-validated is the underlying model for this athlete?

| Level    | Validity                                  | Examples                                  |
| -------- | ----------------------------------------- | ----------------------------------------- |
| High     | Level 1-2 evidence, validated in athletes | ACWR injury risk framework                |
| Moderate | Level 3-5, practitioner consensus         | TSB thresholds, FTP-based TSS             |
| Low      | Level 6, empirical, or no source          | Garmin readiness thresholds, body battery |

### 4. Individual Fit

Does the model's population match this athlete?

| Level    | Fit                                     | Examples                                        |
| -------- | --------------------------------------- | ----------------------------------------------- |
| High     | Evidence from this athlete's population | Well-trained endurance athlete using PMC        |
| Moderate | Extrapolated from similar population    | Endurance athlete using team-sport ACWR         |
| Low      | Significant population mismatch         | Masters athlete using young athlete sleep norms |

---

## Composite Confidence Score

SHARPIT computes a composite confidence level from the four dimensions:

```
Overall confidence = min(completeness, recency) × model_weight × fit_weight
```

Where `model_weight` and `fit_weight` are the model validity and individual fit levels mapped to 1.0 (high), 0.75 (moderate), 0.5 (low).

In practice, the **minimum** of completeness and recency gates the output. Even a perfectly valid model cannot produce confident output from stale data.

**Confidence levels:**

- **High** (0.75–1.0): specific recommendation with normal language
- **Moderate** (0.5–0.74): recommendation with qualifying language ("Based on recent data...")
- **Low** (0.25–0.49): general guidance only ("Insufficient data for precise recommendation")
- **Insufficient** (<0.25): display data gap, no recommendation

---

## Minimum Data Requirements (Operational Reference)

### Training Load / PMC

| Output | Minimum history        | Confidence degradation                    |
| ------ | ---------------------- | ----------------------------------------- |
| CTL    | 1 day (but unreliable) | Low for <21 days                          |
| ATL    | 7 days                 | Low for <7 days                           |
| TSB    | 7 days                 | Low for <7 days                           |
| ACWR   | 28 days                | Disabled for <14 days; low for 14-28 days |

**Implementation note:** new users with <28 days history should see ACWR labeled as "estimation" until the minimum window is met. Currently this is not implemented — ACWR fires from whatever data is available.

### Recovery Signals

| Signal                   | Minimum history                          | Rationale                                                |
| ------------------------ | ---------------------------------------- | -------------------------------------------------------- |
| Garmin readiness (daily) | 1 day (but calibration requires 3 weeks) | Fires immediately; reliability improves                  |
| HRV trend alert          | 10 days                                  | 3-day window vs 4-10 day window requires 10 days minimum |
| RHR trend alert          | 17 days                                  | 3-day vs 4-17 day window requires 17 days minimum        |

### Sleep Analysis

| Analysis               | Minimum history | Notes                           |
| ---------------------- | --------------- | ------------------------------- |
| Duration alerts        | 7 nights        | 7-day average window            |
| Stage analysis         | 1 night         | Single-night thresholds         |
| Regularity (MAD)       | 30 nights       | MAD over 30-night window        |
| Bedtime recommendation | 30 nights       | Median wake time over 30 nights |

### Body Composition

| Analysis                   | Minimum history  | Notes                       |
| -------------------------- | ---------------- | --------------------------- |
| Single measurement display | 1 measurement    | Always available            |
| Trend analysis             | 14+ measurements | Fewer produces noisy trends |

---

## Confidence Communication in the UI

### High confidence

Normal recommendation language. No qualifier needed.

> "Bien récupéré : séance intense possible."

### Moderate confidence

Add qualifier that signals partial data.

> "Basé sur les données disponibles : séance modérée recommandée."

### Low confidence

State the data limitation. Provide general guidance only.

> "Données insuffisantes pour une recommandation précise. Maintiens ton rythme habituel."

### Insufficient confidence

Show data gap prominently. Do not produce a recommendation.

> "Synchronise tes données Garmin pour obtenir une analyse de récupération."

---

## Cold Start Problem

New users arrive with no history. SHARPIT must function on day 1 while being honest about early data limitations.

### Day 1–7 behavior

- Show any available data without interpretation
- No trend-based alerts (HRV, RHR) — insufficient baseline
- No ACWR analysis — insufficient load history
- Sleep analysis: only single-night metrics (stages, score, duration)
- PMC starts at CTL=0 — visually display as "building baseline"
- AI coach behavior: acknowledge new user status; don't make strong claims

### Day 8–28 behavior

- ATL/TSB become meaningful
- Single-session sleep analysis reliable
- ACWR available but low confidence
- Garmin readiness available (Garmin's own calibration separate from SHARPIT's)
- Trend alerts still disabled

### Day 29+ behavior

- Full analysis pipeline active
- ACWR at full confidence after day 42
- HRV and RHR trend alerts enabled
- Sleep regularity analysis (30-night MAD) available
- All recommendation types available

**SHARPIT should display an onboarding status indicator** showing the confidence level and what will become available at what milestone. This is not currently implemented.

---

## Data Quality Flags

Beyond completeness and recency, SHARPIT should flag known data quality issues:

| Flag                     | Condition                 | Effect on recommendations                                    |
| ------------------------ | ------------------------- | ------------------------------------------------------------ |
| `HRV_CALIBRATING`        | <21 days of HRV data      | Suppress Garmin HRV status reliance; use trend when possible |
| `ACWR_LOW_HISTORY`       | <28 days of load data     | Suppress ACWR alert or add low-confidence qualifier          |
| `STALE_SYNC`             | Last sync >48h ago        | Suppress readiness-based recommendations; show sync prompt   |
| `SCALE_CALIBRATING`      | <7 body comp measurements | Suppress body comp trend analysis                            |
| `TRAINING_PLAN_INACTIVE` | No active plan            | Suppress periodization phase context                         |
| `COLD_START`             | <7 days total             | Full cold start mode; general guidance only                  |

**Implementation status:** most of these flags are not currently implemented. They represent a future improvement roadmap.

---

## The Overconfidence Risk

The greatest risk in SHARPIT's design is overconfidence — producing specific, confident-sounding outputs from weak data. The system's credibility depends on its accuracy. An athlete who follows a SHARPIT recommendation that was based on stale data and gets injured will distrust the system permanently.

**Design principle from `product-constitution.md`:** when in doubt, say less. A qualified recommendation that acknowledges uncertainty is better than a specific recommendation that is wrong.

**The test:** before any recommendation is displayed, ask "what is the data foundation for this output?" If the foundation is thin, the language must reflect that.

---

## Plan Gate enforcement (operational)

Language alone is not enough. Coach plan/adapt proposals pass through the Plan Safety & Coherence Gate (`packages/server/src/lib/plan-gate/`). Confidence tiers on the day's DecisionState are enforced there:

| `confidenceTier`                   | Gate behaviour                                              | Athlete effect                                                        |
| ---------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `INSUFFICIENT` or missing decision | Finding `DECISION_INSUFFICIENT_DATA`, severity **REJECTED** | Proposal removed before UI; Decision Memory still records the attempt |
| `LOW`                              | Finding `DECISION_LOW_CONFIDENCE`, severity **REJECTED**    | Same                                                                  |
| `MEDIUM` / `HIGH`                  | Intensity and fatigue compatibility rules only              | Normal Gate path                                                      |

This matches Core `shouldGateAdvice` (confidence below the Medium band, or insufficient data) and closes the prior gap where `INSUFFICIENT` was only `REQUIRES_CONFIRMATION` and still reached the athlete.

Gate findings carry symbolic `evidenceRefs` (e.g. `decision.confidenceTier`). Session Rationale resolves them to French evidence labels for explainability — without exposing raw rule codes.

See also: [`research/competitive-concepts.md`](./research/competitive-concepts.md) (competitor confidence patterns), ADR-005 / ADR-006 / ADR-007.
