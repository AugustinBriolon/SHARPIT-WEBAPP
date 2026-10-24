# ADR-102: Plan adherence is measured in weeks one to four

**Status:** Accepted
**Date:** 2026-10-24
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-044](./ADR-044-sharpit-pro-billing.md), [ADR-050](./ADR-050-web-builds-from-an-app-package-not-the-server.md), [ADR-095](./ADR-095-the-plan-never-runs-out-mid-training-plan.md)

---

## Context

SharpIt's positioning bet is that a self-repairing plan keeps a race triathlete on it: the target
is **70 % plan adherence over weeks 1 to 4**. Nothing measured it. There is no product analytics,
no adherence figure in the code, and the hub only carries marketing pages, so we could not tell
whether the plan, the catch-up flow or the coach keep anyone training.

The data is already there: every planned session is a `PlannedSession` row with its day, its
`completed` flag, the activity it is linked to, `isKey` and the brick it belongs to.

---

## Decision

We compute each athlete's week 1–4 adherence on the server from `PlannedSession` and show it on
`/admin` (admins only, as the tier toggle).

- **Week 1 starts on the athlete's first planned day**, when their plan really begins — not on
  the account's creation, which can precede the first plan by days.
- **Done** means `completed` or linked to an activity.
- **Only days already over count** (Europe/Paris training day). A week is `closed`, `running`
  (today falls in it) or `upcoming`.
- **A brick is one entry**, as in Plan: done once two legs (or its only one) are done.
- **Two figures per week**: every session, and key sessions alone. A week with no session marked
  key counts every session as key — the same rule as « Dommage pour hier ».
- **The target is 70 %**: a closed week that reaches it is drawn lime. The cohort line averages
  closed weeks only and counts the athletes whose week 4 reached the target.

The arithmetic is a pure module, `@sharpit/app/lib/admin/plan-adherence`, so the web can type
the payload (ADR-050); `loadPlanAdherence` reads it in two queries whatever the number of athletes
(the first planned day per athlete, then the 28 days from it).

---

## Options considered

### A — Server-side from `PlannedSession`, on `/admin` (chosen)

- **Pros:** no SDK, no consent banner, no new data leaving the server; exact, since it reads the
  rows the plan is made of; live for every athlete, past ones included.
- **Cons:** a figure for the operator only; no funnel or screen-level behaviour.

### B — A product analytics SDK (PostHog, Amplitude)

- **Pros:** funnels, retention curves, screen events.
- **Cons:** a consent surface and a processor to declare for health-adjacent data; events must be
  instrumented on both clients before any number exists; adherence would still be derived from
  the plan, which the server already holds.

### C — A nightly materialised table

- **Pros:** cheap reads at scale, history kept.
- **Cons:** a cron, a schema change and a migration for a page one person opens; premature at the
  current number of athletes.

---

## Consequences

### Positive

- The positioning bet becomes a number per athlete and for the cohort, visible on `/admin`.
- Changes to the plan, the catch-up flow or the coach can be judged by the weeks that follow.

### Negative

- **Deleting a missed session raises the figure**: sessions are hard-deleted, so a removed miss
  leaves no trace. Acceptable while the cohort is small; a deletion log would close it if the
  numbers turn out to be inflated.
- A session moved to another day counts on its new day.
- The page reads every athlete's first 28 days on each load; fine at tens of athletes, option C
  becomes the answer past a few thousand.

### Neutral

- Athletes who never had a planned session show « Aucune séance planifiée ».
