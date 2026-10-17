# ADR-091: An unreliable daily decision only withholds hard sessions

**Status:** Accepted
**Date:** 2026-10-18
**Author:** Augustin Briolon

---

## Context

The plan Gate's `decisionCompatibilityRule` rejected **every** proposed session when the day's
decision was missing or its confidence tier was `INSUFFICIENT` or `LOW`
(`DECISION_INSUFFICIENT_DATA`, `DECISION_LOW_CONFIDENCE`).

A brand-new account has no synced nights, no HRV and no training history, so its decision is
always low-confidence. On 2026-10-17 a new strength-only account finished the iOS onboarding and
the first week came back empty: the coach proposed three strength sessions, the Gate rejected all
three on `DECISION_LOW_CONFIDENCE`, and the plan route answered « Aucune séance exploitable : le
coach n'a proposé que des séances à éviter pour toi en ce moment ». The athlete had declared no
pain, so the message pointed at nothing they could act on. Every new athlete, endurance or
strength, hits the same wall on day one.

The rule also judged sessions up to a week ahead against today's reading, which says little about
those days anyway.

## Decision

When the decision is missing, `INSUFFICIENT` or `LOW`:

- a hard session (`TEMPO`, `THRESHOLD`, `VO2MAX`, `RACE` — `PLAN_GATE_HIGH_INTENSITY`) is still
  **rejected**, with an endurance version as `saferAlternative` (load × 0.6);
- every other session (endurance, recovery, strength, mobility, no intensity) gets a **warning**
  under the same rule code, telling the athlete the session stays moderate until their nights are
  synced.

The rule codes are unchanged, so decision memory (`classify-trigger.ts`) and the session rationale
keep reading them.

## Options considered

### Option A — Withhold only the hard sessions (chosen)

Pros: a new athlete gets a first week; the safety intent (no intense work without a reliable
reading) holds. Cons: an easy session can be prescribed on a day the body would have said no;
the existing load and fatigue rules still apply to it.

### Option B — Skip the rule for accounts younger than N days

Pros: keeps the strict rule for established athletes. Cons: an arbitrary threshold, and an
established athlete whose watch stopped syncing would still lose a whole week.

### Option C — Keep the rule, improve the error copy

Pros: no behaviour change. Cons: the onboarding still ends without a plan for every new user.

## Consequences

### Positive

- The onboarding's « Première semaine » produces sessions for a new account.
- A missing night no longer empties « Remplir ma semaine » for an established athlete.

### Negative

- Easy and strength sessions can be planned on a low-confidence reading; the athlete sees a
  warning rather than a refusal.

### Neutral

- `evaluate-plan.test.ts` now expects easy sessions as `WARNING` and hard ones as `REJECTED`
  under a missing decision.

## References

- `packages/server/src/lib/plan-gate/rules/decision-compatibility.ts`
- `packages/server/src/handlers/coach/plan/handler.ts` (the « Aucune séance exploitable » path)
