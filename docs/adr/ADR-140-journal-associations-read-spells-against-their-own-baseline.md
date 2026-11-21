# ADR-140: Journal associations read spells of a habit against the mornings around them

**Status:** Accepted
**Date:** 2026-11-21
**Author:** Augustin Briolon (with Claude Code)
**Amends:** [ADR-098](./ADR-098-journal-associations-adjust-for-load-and-chance.md) (its « Scientific debt » and its lead threshold)

---

## Context

ADR-098 made the habit analysis account for training load and for chance, and listed what it still
did not control: trips, illness and slow trends. Its noise test drew every day independently, with
each habit a coin toss. A real journal is not like that: a habit is kept for days in a row, one
morning resembles the one before, form moves by blocks, and a remedy is taken when ill.

Measured on simulated journals where no habit has any effect (300 journals per case, 12 habits):

| Journal                                                          | Journals with a net row         | With any row |
| ---------------------------------------------------------------- | ------------------------------- | ------------ |
| Habits in runs, mornings that follow each other, 60 days         | 28 %                            | 57 %         |
| Form steps up half-way, one habit started the same week, 90 days | 90 % (the habit named in 94 %)  | 96 %         |
| Two bouts of illness, one remedy taken during them, 90 days      | 14 % (the remedy named in 42 %) | 55 %         |

Three defects produce it:

1. **Days in a row were counted as separate observations.** Six evenings of one holiday week are one
   observation of that week. The rank test read them as six.
2. **Every morning was compared with the whole journal.** A habit started with a new training block
   took the block's whole shift.
3. **Ill mornings were compared like any other.** What is done because of the illness carried its
   blame.

Core is frozen: the fix stays in the presentation analytics (`packages/app`) and its loader.

---

## Decision

1. **Own baseline.** After the load and weekend adjustments, each morning is read against the median
   of the mornings within ten days on each side (itself left out), brought back to the journal's
   overall level (`baselineAdjuster`). Fewer than six mornings around: the value is read as it is.
2. **Spells.** Days in a row with the same answer are one spell; a gap of more than three days with
   nothing noted starts a new one. The Mann–Whitney test compares the spells' medians, not the days.
   - A lead needs three separate spells on each side, a net row five (`MIN_EPISODES_*`). Fewer is a
     before/after and shows nothing.
   - The day counts and the medians shown to the athlete are unchanged: still days.
3. **Illness and trips are set aside.**
   - A day with `fever`, `cold_congestion` or `antibiotic` noted is left out of every other habit's
     contrast, as the habit's day or as its morning. The illness is still read against its own
     mornings.
   - The athlete's trips (`AthleteTravelContext`, type `TRAVEL`) and the periods declared sick
     (`AthleteActivityStatusHistory`) are left out for every habit (`loadExcludedDayIds`). A period
     over 120 days is not set aside.
   - None of these days enters the load, weekend or baseline fits.
4. **A lead needs p ≤ 0.05**, down from 0.20. Net keeps q ≤ 0.10 across all contrasts.

The payloads of `/api/v1/journal/analyses` and of the web page do not change.

---

## Rationale

- **A baseline around the morning, not a trend line.** Form moves by steps and plateaus, which a
  straight line misses. A window on both sides is possible because the analysis looks back.
- **Spells, not a permutation test.** It is the same cure — treat a run as one draw — with no
  random draws and no extra cost on a page read.
- **Leaving ill days out, not adjusting for them.** There are too few to fit anything, and their
  mornings carry no information on a habit.

Same simulation, after:

| Journal                            | Net row | Any row | Named confound |
| ---------------------------------- | ------- | ------- | -------------- |
| Habits in runs, 60 days            | 0 %     | 6 %     | —              |
| Step with a habit started, 90 days | 0 %     | 5 %     | 0 %            |
| Illness with a remedy, 90 days     | 0 %     | 9 %     | 2 %            |

A real cost of 12 recovery points the morning after a habit of three days in ten is still found in
88 % of 60-day journals (90 % before) and 94 % of 120-day ones (96 %); it is net in 59 % and 85 %
(77 % and 86 %).

---

## Alternatives Considered

### Alternative 1: Adjust for the previous morning (autoregression)

**Cons:** the previous morning already carries the effect of a habit kept over several days, so
the adjustment removes part of what is looked for.
**Rejected because:** spells handle the dependence without touching the effect.

### Alternative 2: Require the gap in both halves of the journal

**Cons:** halves a sample that is already small; a 40-day journal would show nothing.
**Rejected because:** the baseline and the spells already bring net false rows near zero.

---

## Consequences

### Positive

- A habit kept in one block, started with a training block or taken when ill no longer gets a row.
- Covered by `journal-habit-analysis.test.ts` (a before/after block, illness, days set aside, a
  step in form, and seeded journals with runs and a real effect) and
  `journal-habit-statistics.test.ts` (the baseline).

### Negative

- A habit taken every day for weeks, then dropped, shows nothing until it has been on and off three
  times. That is what the 7-day test (ADR-032) is for.
- A real effect of a habit present most days of a window is partly absorbed by its own baseline.
- A net row comes later on a short journal (59 % against 77 % at 60 days for the effect above).
- Rows athletes saw before may disappear.
- Two more queries on every analysis read (trips, status history).

### Scientific debt created

- The outcomes are still sleep duration, Training Readiness and Body Battery. HRV and resting heart
  rate, the markers most sensitive to alcohol or a late meal, are not read: the iOS client decodes
  the outcome as a closed set, so adding one needs an app release first.
- Whether `DailyHealth.bodyBattery` is the value on waking or the last one of the day was not
  established. If it is the latter, it is not a morning reading and should leave the outcomes.
- Injury periods and `paused` status are compared like ordinary days.

---

## Review Criteria

- If athletes report rows that vanished while a habit clearly alternates: lower `MIN_EPISODES_HIGH`.
- If leads still read as noise on journals under 60 days: require the direction of the rank test and
  of the medians to agree.
