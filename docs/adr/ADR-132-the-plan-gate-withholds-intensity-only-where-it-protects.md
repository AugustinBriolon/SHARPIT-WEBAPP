# ADR-132: The plan Gate withholds intensity only where it protects

**Status:** Accepted  
**Date:** 2026-11-15  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

An athlete reported that generated weeks held almost no high-intensity work. The first reading
blamed the generator's inputs and its model. Measurement said otherwise.

After a week is generated, `evaluatePlan` gates every proposed session and `finalizePlan` removes
the ones it rejects before the athlete sees anything. The rejection is recorded as a coaching
decision; on screen the session is simply absent.

What the production record of one athlete shows over 180 days (`CoachingDecision`, source
`PLAN_GENERATOR`, endurance sports):

| Proposed intensity | Proposed | Rejected |
| ------------------ | -------- | -------- |
| Threshold          | 14       | 14       |
| Tempo              | 39       | 35       |
| Race               | 2        | 2        |
| Endurance          | 81       | 2        |
| Recovery           | 25       | 0        |

- 51 of the 55 hard sessions the generator wrote were removed.
- 51 rejections carry `PHYSICAL_HEALTH_LIMITED`, continuously from 19 July to 13 November. The
  cause is one posture note (« Pied en canard », severity 4/10, one observation, confidence 0.43).
  The Core maps severity 4–6 to capacity `LIMITED` whatever the condition's type, the aggregate
  takes the worst active condition, and `LIMITED` rejects tempo and above in every sport.
- 7 rejections carry `DECISION_INTENSITY_CONFLICT` or `DECISION_LOW_CONFIDENCE`. Every one is on a
  session dated 3 to 8 days after the day whose state was read. The Gate loads one snapshot, the
  plan's start day, and applies its verdict, confidence tier and fatigue capacity to the whole
  week. When that day is still to come it has no night behind it: recovery confidence 0, data
  completeness `SPARSE`, tier `LOW`, while the same athlete's two previous days read `HIGH`.

A local measurement confirms the model is not the cause: 21 generations across
`google/gemini-3-flash`, `anthropic/claude-haiku-4.5` and `anthropic/claude-sonnet-4.5` wrote 37
threshold or tempo sessions, and the Gate rejected 37.

The plan prompt already holds both distinctions the Gate lacked. It tells the coach that posture
and mobility are not pain and must not lighten intensity, and `planContextSections` drops the day's
decision when the week starts later, because « the day's verdict only binds a week that starts
today ». The Gate, which has the last word, contradicted both.

Constraint: the Core is frozen (`docs/models/CORE_ARCHITECTURE.md`). The change must live in the
Gate and in the handler.

---

## Decision

Keep the Gate strict where a session can hurt, and stop it from removing intensity anywhere else.
Three rules:

1. **Nature.** Conditions of type `POSTURE_ISSUE` and `MOBILITY_LIMITATION` never lower the Gate's
   training capacity and never block training. `physicalHealthRule` aggregates the snapshot's
   active conditions again without them (`limitingSignals`). Pain, injury and every other type
   keep their effect. A snapshot that lists no condition keeps its stored aggregate.
2. **Never silently.** A session the Gate rejects is offered as its lighter version instead of
   being removed (`plan-gate/lighter-version.ts`). The lighter version keeps the sport, the day and
   the duration, takes the rejecting rule's safer intensity and load, drops the structured steps,
   and carries the rule's rationale as its reason. It goes through the Gate again and is recorded
   as a decision of its own, because « Ajouter » refuses a session whose decision was rejected. A
   rejection with no same-sport alternative, or whose lighter version is rejected again, is still
   taken out.
3. **Time scope.** The Gate reads the athlete as they are today, not on a start day still to come
   (`finalizePlan`), as the plan adapter already does. The day's verdict and the day's fatigue
   capacity only judge sessions dated that day (`decisionCompatibilityRule`). A missing decision
   or a `LOW` / `INSUFFICIENT` confidence tier still withholds hard sessions for the whole week:
   that is the new-account protection of ADR-091 and it is unchanged.

---

## Rationale

- The Gate exists to stop a session that would aggravate something. A flat foot noted four months
  ago does not make a swim threshold set dangerous; a knee pain does make a run interval session
  questionable. Rule 1 puts the line where the prompt already puts it.
- A removed session teaches the athlete nothing and hides the Gate's own reasoning. The rules
  already compute a safer alternative (`saferAlternative`) that nothing used. Rule 2 uses it and
  shows why.
- A day's readiness is information about that day. The product already has the mechanism for the
  other days: morning recalibration proposes to raise or lower the session each morning (25 such
  decisions in the same athlete's record). Rule 3 lets it do that job.
- All three are deterministic, live outside the Core, and each is covered by unit tests that
  reproduce the production case.

---

## Alternatives Considered

### Alternative 1: The athlete edits the note

**Description:** Lower the posture note's severity to 3 or untick « affects training ».

**Pros:**

- No code change, immediate.

**Cons:**

- Fixes one account. Every athlete who records a posture trait at 4/10 falls into the same trap.
- Asks the athlete to understate a real observation to get a correct plan.

**Rejected because:** the defect is in how the Gate reads the note, not in the note.

### Alternative 2: Stop reading physical health in the Gate

**Description:** Remove `physicalHealthRule` from plan generation and rely on the prompt.

**Pros:**

- Removes the whole class of false rejections.

**Cons:**

- A model can ignore a prompt rule; the Gate is the only deterministic protection for an athlete
  with an active pain or injury.

**Rejected because:** it trades a false positive for an unsafe false negative.

### Alternative 3: Change the severity-to-capacity mapping in the Core

**Description:** Make `inferTrainingCapacityFromSeverity` depend on the condition type.

**Pros:**

- One source of truth; Today and the daily decision would agree with the Gate.

**Cons:**

- The Core is frozen. The same mapping feeds the daily decision's arbitration, whose behaviour
  this decision does not intend to change.

**Rejected because:** out of scope for a frozen Core; revisit when the Core reopens.

### Alternative 4: Sport locality and freshness now

**Description:** Also restrict a pain to the sports that load its zone, and downgrade old or
low-confidence conditions from rejection to confirmation.

**Pros:**

- Finer still: a knee pain would no longer hold back a swim session.

**Cons:**

- Needs thresholds for age and confidence that have no evidence yet, and a zone-to-sport mapping
  that today only produces warnings (ADR-037).

**Rejected because:** deferred, not refused. Rules 1 to 3 remove the measured cause; these two
need their own evidence.

---

## Consequences

### Positive

- On the production athlete's current state the Gate reads capacity `REDUCED` (a knee pain at
  2/10) instead of `LIMITED`, and confidence `HIGH` instead of `LOW`: tempo and threshold sessions
  are proposed with a confirmation instead of being removed.
- A rejected hard session appears as an endurance session with the reason written on it. In four
  local generations, 9 rejected sessions came back this way and weeks kept all three sports.
- Every rejection is still recorded, and each lighter version has its own decision row.

### Negative

- Rule 3 changes every caller of the Gate, not only week generation: the plan adapter and the
  chat's session tools no longer reject tomorrow's hard session because today's fatigue reads
  `REST_ONLY`. That session now depends on morning recalibration being seen.
- The plan adapter still removes its rejected changes silently. Rule 2 covers week generation only.
- Rule 1 copies the Core's aggregation (worst capacity, block at severity 5) into the Gate, since
  the Core's function takes its own un-serialized type. The two can drift.
- Rule rationales were written for a findings panel. Some hold internal codes
  (« Le verdict du jour est "RECOVER" — une séance THRESHOLD… ») and can now be read as a
  session's reason. They need rewriting in plain language.
- Lighter titles are composed in French (« Course · Endurance »); their English rendering is not
  verified.
- A today snapshot read before the night's data has synced can still be `LOW` and withhold hard
  sessions for the week (21 of 108 same-day snapshots since August for this athlete).

### Scientific debt created

- The posture/mobility exemption is a product rule aligned with the prompt, not a finding: no
  evidence level is claimed for « a posture trait never warrants lower intensity ».
- The effect of rules 1 to 3 on a real generated week has not been observed in production; the
  expected result above is deduced from the athlete's stored state.

---

## Review Criteria

- If an athlete with only posture or mobility conditions reports pain after a session the Gate
  let through, revisit rule 1 for that condition type.
- If morning recalibration is shown to be ignored (hard sessions kept on mornings whose verdict is
  `RECOVER`), revisit rule 3 for the next day's sessions.
- If more than a third of offered sessions are lighter versions for an athlete over four weeks,
  the rejecting rule is too broad: look at it rather than at the lighter version.
- When the Core reopens, move rule 1 into the severity-to-capacity mapping (Alternative 3) and
  delete the Gate's copy.

---

## References

- ADR-037 — injury declaration changes training retroactively (zone rules are warnings)
- ADR-068 — a declared zone has a strategy and a lifecycle
- ADR-091 — an unreliable daily decision only withholds hard sessions
- ADR-100 — sensitive zones over time
- `packages/server/src/lib/plan-gate/rules/physical-health.ts`
- `packages/server/src/lib/plan-gate/rules/decision-compatibility.ts`
- `packages/server/src/lib/plan-gate/lighter-version.ts`
- `packages/server/src/handlers/coach/plan/handler.ts` (`finalizePlan`)
