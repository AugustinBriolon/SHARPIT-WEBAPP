# Coach phase 0: error analysis of production conversations

Date: 2026-10-27. Read-only pass over the prod Neon database (project SHARPIT). Athletes are
anonymised as A (main athlete, ~600 activities), B (account created 2026-10-17, 2 activities) and
C (demo athlete). No conversation text leaves this file beyond paraphrase.

## What was read

- 22 `Conversation` rows, 41 messages: 21 user, 20 assistant. Every message was read. Text parts
  were capped at 1,500 characters and tool inputs/outputs at 400/300 characters in the export, so
  the tail of the longest answers was not read.
- Joined to `PlannedSession` and `Activity` for every session the coach created or moved, to
  `Condition` / `PhysicalNote` for the body facts it cited, and to `CoachingDecision`.
- The corpus is far below the 100 turns the plan asked for. Rates below are counts, not
  statistics. Athlete A wrote 16 of the 20 answers.

## What the data can and cannot tell

| Signal                                       | Stored?                                                                         | Consequence                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Messages with tool calls, inputs and outputs | Yes (`Conversation.messages`, UI parts)                                         | Taxonomy is possible                                             |
| Context the model saw on each turn           | **No**                                                                          | Figures it quotes (TSB −95, « capacité 88 % ») cannot be checked |
| Tokens per call                              | Yes (`AiUsageEvent`, feature `coach`)                                           | Cost baseline possible; not yet joined to turns                  |
| Latency, stop reason per turn                | Only in `withCoachTrace` traces, not in the database                            | Not checked in this pass                                         |
| Coach-written session → done                 | Yes (`PlannedSession.activityId`)                                               | Follow-through is measurable                                     |
| Coach proposals as decisions                 | **No**: `CoachingDecisionSource` is only `PLAN_GENERATOR` / `PLAN_ADAPTER`      | Coach chat bypasses decision memory                              |
| Decision outcomes                            | **0 rows of 305 decisions**: `evaluateAndSaveDecisionOutcome` is never imported | The outcome loop the schema promises does not run                |

## Failure taxonomy

Ranked by harm × frequency. "n" counts the assistant messages showing the failure, out of 20.

| #   | Failure                                      | n                      | Harm       | Example (paraphrased)                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------- | ---------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Another athlete's health facts**           | 1 (whole conversation) | Critical   | B, first message, no history: the coach plans around « bassin rétroversé, épaules enroulées, genou droit, nerf sciatique ». These are A's `Condition` rows. Cause: `PrismaConditionRepository` read every athlete's conditions until `831cee19` (2026-10-18). See « Cross-athlete condition leak » below. |
| 2   | **Writes, then asks permission**             | 4                      | High       | Creates 5 sessions or edits 2, then ends with « Est-ce que ce programme te convient ? ». The question is after the fact.                                                                                                                                                                                  |
| 3   | **Says it acted without a tool call**        | 1                      | High       | « Je mets à jour la structure » followed by a raw `updatePlannedSession` JSON block in the text. Nothing was written by the coach.                                                                                                                                                                        |
| 4   | **Text and tool disagree**                   | 1                      | High       | Nutrition: advises 30–40 g of chicken and lists 40 g, but `logFoods` writes 200 g; advises 60–80 g of pasta and logs 100 g.                                                                                                                                                                               |
| 5   | **Factual or pseudo-scientific claims**      | 3                      | Medium     | A half-Ironman described as « 180 km de vélo et un semi » (it is 90 km). « Drainer les toxines », « évacuer les déchets métaboliques » in three answers.                                                                                                                                                  |
| 6   | **Tool warnings ignored**                    | 5                      | Medium     | `strengthAudit` returns « séance sous-remplie : 26 min pour 45 min » on 9 created sessions. Only once does the coach say so; it never fixes it.                                                                                                                                                           |
| 7   | **Internal codes leak to the athlete**       | 5                      | Low–medium | Enum verdicts (`RECOVER`, `TRAIN_EASY`) and session ids in backticks in the answer.                                                                                                                                                                                                                       |
| 8   | **Inconsistent verdict in one conversation** | 1                      | Medium     | Same day: « Verdict : REPOS », then two turns later « Verdict SharpIt (TRAIN_EASY) ».                                                                                                                                                                                                                     |
| 9   | **Misreads a denied tool call**              | 1                      | Medium     | The athlete denied `createPlannedSession`; the coach answers « il semble y avoir eu une petite erreur » and re-offers the same session.                                                                                                                                                                   |
| 10  | **Plans with no baseline**                   | 1                      | Medium     | B (2 activities, account a day old) gets a 5-session strength week « sans compétition » it cannot know about. 0 of 5 done.                                                                                                                                                                                |
| 11  | **Empty advice dressed as optimisation**     | 1                      | Low        | « Point d'optimisation : l'horaire du vendredi… c'est parfait » with no change.                                                                                                                                                                                                                           |
| 12  | **Same paragraph twice in one answer**       | 1                      | Low        | Strategy block repeated before and after the tool calls.                                                                                                                                                                                                                                                  |

Infrastructure faults seen through the conversations:

- **Exercise search regressed.** `searchWatchExercises` matched « Étirement chat et vache » and
  « 90/90 » on 15–16 Oct and returned `matches: []` for the same queries on 20 and 25 Oct (5 empty
  of 13 calls).
- **Duplicated or lost messages.** Two conversations store the same user message twice in a row
  (client double-send). One stores two user messages with no answer between them while the second
  (« Non, j'ai allégé ») replies to an answer that is not stored.

What went right, so it is kept: constraints from the profile (remote-work days, evening
preference) are honoured every time; caution on the sciatic nerve is consistent and correct-side;
recovery after the race is conservative; the coach once disclosed a too-short session itself.

## Current metrics

| Metric                                      | Value                     | Note                                                                                     |
| ------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| Coach-written sessions done (A, past dates) | 10 / 10                   | 1 more is today. Durations within ±15 min except a 3-min mobility session for 20 planned |
| Coach-written sessions done (B)             | 0 / 5                     | New account, whole week planned                                                          |
| `presentWorkout` cards drawn in prod        | 0                         | Shipped after the last conversations                                                     |
| `suggestFollowUps` sets / tapped            | 4 sets, 2 tapped verbatim | Only since 25 Oct                                                                        |
| Turns with a write tool                     | 8 / 20                    | 15 creates, 7 updates, 1 food log                                                        |
| Cost and latency per turn                   | Unknown                   | Not stored                                                                               |

## What Phase 1 needs before an eval harness is worth building

1. **Resolve failure 1.** Trace how B's conversation got A's conditions. If it is a leak, it is a
   security fix that ships before anything else in this plan.
2. **Store the turn's context and usage.** Without the context snapshot no figure is checkable,
   and without tokens no cost baseline exists. A `CoachTurnTrace` row (context hash + compact
   snapshot, tokens, steps, stop reason, latency) per turn is the smallest change.
3. **Wire the outcome loop.** `evaluateAndSaveDecisionOutcome` exists and is never called; coach
   writes are not decisions. Proposed → done is today computable only by hand.
4. **Grow the corpus.** 20 answers from mostly one athlete cannot calibrate an LLM judge
   (κ needs ~50 labelled turns). Synthetic personas are required: beginner, taper, injured,
   illness, eating-disorder signal, chest pain, minor.

Failures 2, 3, 4, 6 and 9 are deterministic: they can be asserted from the stored parts alone,
with no judge. They are the first eval cases.

## Cross-athlete condition leak

**Cause.** Until `831cee19` (`fix(security): scope physical-health conditions to their athlete`,
2026-10-18 00:52), `PrismaConditionRepository.findAllForInference` and
`getConditionHistoryForFeatures` ran `prisma.condition.findMany` with no `athleteId` filter, and
`applyInferredUpdates` wrote by condition id alone. Only athlete A had conditions, so every other
athlete's physical-health run read A's. The current code is scoped; no contaminated row is dated
after 2026-10-17, so the fix is live.

**Path to the coach.** physical-health engine run for B (10:55:05, one second after the account
was created) → `DecisionRecord` `physical-health-v1` holding A's 6 conditions →
`AthleteSnapshotRecord.physicalHealth` for 16–17 Oct → `buildCoachContext` → the system prompt.
Every context source was scoped by athlete; the snapshot carried the foreign data in.

**Still stored** (rows whose `conditionId` belongs to another athlete):

| Athlete     | Snapshots | Physical-health decision records | Briefings naming A's conditions | Days            |
| ----------- | --------- | -------------------------------- | ------------------------------- | --------------- |
| 2d6b (B)    | 10        | 165                              | 1, plus one coach conversation  | 16–17 Oct       |
| 4804        | 132       | 220                              | 26                              | 15 Sep – 17 Oct |
| 4985 (demo) | 0         | 646                              | 0                               | 26 Aug – 17 Oct |
| 738c        | 4         | 4                                | 0                               | 25 Sep          |
| 78c5        | 4         | 4                                | 0                               | 24 Sep          |
| 8c70        | 88        | 88                               | 16                              | 27 Sep – 17 Oct |
| e503        | 188       | 384                              | 27                              | 1 Sep – 17 Oct  |
| f138        | 92        | 108                              | 16                              | 25 Sep – 17 Oct |

Briefings were read in full for one athlete: they tell that athlete to « surveille[r] ta gêne au
genou droit » and their feet and pelvis. Past days are served as stored (web ADR-101), so these
briefings and snapshots still show if an athlete opens one of those days. `DigitalTwin` rows and
`CoachingDecision.snapshotContext` are clean.

## Baseline with the deterministic checks (ADR-118)

Run on the 21 stored conversations that remain after the purge (19 assistant answers; the
purged conversation of athlete B held one more). Checks in
`packages/server/src/lib/coach/evals/turn-checks.ts`. Counts are upper bounds: precision is not
measured yet.

| Check                 | Answers flagged |
| --------------------- | --------------- |
| empty-answer          | 0               |
| writes-then-asks      | 3               |
| claims-without-tool   | 1               |
| raw-tool-json         | 1               |
| internal-codes        | 5               |
| audit-warning-ignored | 3               |
| denied-misread        | 1               |
