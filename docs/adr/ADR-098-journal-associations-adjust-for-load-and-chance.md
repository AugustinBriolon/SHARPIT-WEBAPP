# ADR-098: Journal associations adjust for training load and for chance

**Status:** Accepted
**Date:** 2026-10-20
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** the « no test statistic » choice of [ADR-032](./ADR-032-journal-habit-experiments-derived-at-read.md) (Alternative 3), for associations only
**Related:** [ADR-011](./ADR-011-pmc-state-and-window-semantics.md)

---

## Context

`/journal/analyses` (web and iOS) compares the median of a morning outcome (sleep, recovery,
Body Battery) on days with a habit against days without it. A gap was « net » with six days per
side, a fixed size threshold (40 min, 10 points) and a heuristic sample score. The athlete read the
result and found most rows meaningless. Their 40-day reading showed:

- Douche froide −14 recovery, Repas tardif −10, flagged net.
- Multivitamines, Oméga-3, Collagène and Vitamine D all at « sans 75 → avec 53/54 », each on
  about 7 days « sans ».

Four defects produced it:

1. **Training load was not controlled.** A cold shower follows the hard session, and the hard
   session lowers the next morning's recovery, so the shower took the blame.
2. **No account of chance.** About 50 habits × 3 outcomes are compared on every read. On pure
   noise (12 habits, 40 days, recovery independent of everything), the old rule flagged a net
   association in 53 of 200 runs.
3. **Habits logged together were counted as separate findings.** The four supplements fall on the
   same days, so there is one contrast and it cannot be attributed to any of them. The page showed
   it four times.
4. **The wrong morning.** Every outcome is read on waking. A habit of day J (a supplement, a cold
   shower) was compared with the morning of J, a night it came after. Only alcohol and coffee
   were shifted to J+1.

Core is frozen, so the fix has to stay in the presentation analytics (`packages/app`).

---

## Decision

Keep the median comparison, its thresholds and its wording. Add four corrections in
`journal-habit-analysis.ts`, with the statistics in a new pure module
`journal-habit-statistics.ts`.

1. **Lag.** Every habit of the day is compared with the morning of J+1. Prior-night factors
   (`window: 'prior_night'`) and concurrent states (fever, pain, menstruation, low mood…) keep
   lag 0, because they already describe that morning.
2. **Load adjustment.** `loadJournalHabitFindings` loads daily TSS through
   `loadDailyTrainingStressEntries` (the PMC's source, ADR-011). Each outcome is regressed on the
   TSS of the day before the morning, over the athlete's own days. The comparison then runs on
   values brought back to the athlete's average load. The fit needs at least 10 measured days and
   some variation in load, otherwise raw values are used. A day with no activity counts as 0 TSS.
3. **Chance.** Each contrast gets a two-sided Mann–Whitney U p-value (normal approximation, tie
   and continuity corrections). Benjamini–Hochberg runs across every contrast tested in the read.
   - **Net:** the old size and sample rule still holds, and q ≤ 0.10.
   - **Lead (« à confirmer »):** the old rule still holds, and p ≤ 0.20.
   - Below that, the row is dropped.
4. **Inseparable habits.** Two habits with a phi coefficient ≥ 0.7 over the days both were noted
   join one group. The group shows as one row whose title names every member (« Oméga-3,
   Collagène et Vitamine D »).
   - A group is never the priority lever, and never gets the 7-day test CTA.
   - The action hint tells the athlete to stop one of them for 7 days to tell them apart.
5. **Wording.** The plate's verdict says « Ton écart le plus net » instead of « Ton levier le
   plus net ». It names a gap in the data, not a lever.

The 7-day test (ADR-032) keeps its before/after method. It inherits the single next-morning lag.

---

## Rationale

- **Ranks, not values.** Mann–Whitney ignores how extreme one night is, which matches the
  median framing, and it needs no dependency.
- **False discovery rate, not Bonferroni.** With 150 contrasts, Bonferroni would hide every
  real effect a 40-day journal can show. FDR at 10 % bounds the share of net rows that are
  chance. On the same pure-noise test, runs showing any net row dropped from 53/200 to 12/200.
- **Linear load fit on the day before.** It is the confounder the athlete pointed at, and it is
  measured for every day from the PMC. A richer model (CTL, sleep debt, weekday) would need
  more days than a journal holds.
- **Grouping, not partial correlation.** When two habits are always noted together, no model can
  separate them. Saying so is the honest reading.

---

## Alternatives Considered

### Alternative 1: Permutation test

**Pros:** exact under exchangeability; no approximation.
**Cons:** about 1 000 shuffles × 150 contrasts on every page read, and non-deterministic output
unless seeded.
**Rejected because:** the normal approximation is accurate at these sample sizes (n ≥ 4 per
side, about 40 days) and costs nothing.

### Alternative 2: Stratify by load tercile instead of regressing

**Pros:** no linearity assumption.
**Cons:** splits 40 days into three groups of about 13, which leaves 2–4 days per arm and kills
every contrast.
**Rejected because:** at this volume of data it throws away more signal than it protects.

### Alternative 3: Hide supplements entirely

**Cons:** loses real signal (creatine and magnesium are plausible). It also leaves the
co-occurrence problem for any other pair of habits taken together.
**Rejected because:** grouping handles the general case. The plausibility priors already keep
supplements out of the priority.

---

## Consequences

### Positive

- A habit that follows hard sessions is no longer blamed for them.
- Fewer, more trustworthy net rows. Habits taken together show as one row.
- Covered by `journal-habit-statistics.test.ts` (Mann–Whitney against the scipy value,
  Benjamini–Hochberg, the load fit) and `journal-habit-analysis.test.ts`:
  - the cold shower after hard sessions;
  - four supplements merged into one row;
  - the false-positive rate on noise kept under 10 %.

### Negative

- Every journal analysis read also loads the activity history and session features for the PMC.
  It is the same query the plan gate runs. Revisit if p95 regresses.
- Rows athletes saw before may move or disappear, because the lag changed for every habit of the
  day.
- A linear fit on the day before misses longer fatigue (a load block over several days).

### Scientific debt created

- Travel, illness, weekday and slow trends (a block that starts with a new supplement) are
  still not controlled.
- The load fit is shared by all habits. A habit that is itself caused by load (taking the
  protein shake _because_ of the session) is adjusted as intended. A habit that _changes_ how load
  affects recovery is not modelled.

---

## Review Criteria

- If athletes keep reporting implausible net rows: add a weekday term and a 7-day trend to the
  adjustment.
- If the analysis read's p95 exceeds about 800 ms: cache daily TSS per athlete.
