# Coach visuals: plan and findings (2026-10-28)

Goal: the coach shows the visual that fits the question, and answers feel live, with any model that
calls tools. Builds on ADR-111 (display tools), ADR-117 (turn traces) and ADR-118 (checks).

## Findings in the code

- The card catalogue holds two cards: `presentWorkout` and `suggestFollowUps`. No card shows data.
- The read tools (`explainDayScores`, `compareSleepVsReadiness`, `explainTargetBand`) return
  `{ ok, markdown }` only. The structured values exist inside each tool (day scores, the sleep and
  readiness points, the target band) and are dropped when formatted. A card cannot reference a field
  of these outputs until the tools also return them.
- `CoachTurnTrace` stored counts only. Since migration `20261028090000_coach_turn_trace_turn` it
  also stores the answer text and every tool call with its input, output and state.
- The first export (19 coach answers) is too small to pick a catalogue: 9 carried figures in prose.

## Steps

| Step | Content                                                                                                                                                                                   | Gate                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A    | Store the turn in the trace (done)                                                                                                                                                        | none                              |
| B    | Collect 1 to 2 weeks of traces, label the questions that wanted a data visual, fix the catalogue and the pass threshold                                                                   | traces exist after the push       |
| C    | Add a structured `data` field beside `markdown` in the read tools; add data cards bound to it by reference; the server drops a card whose data is missing; iPhone decodes it like ADR-111 | catalogue approved                |
| D    | Eval on the labelled set, then A/B behind a flag                                                                                                                                          | threshold written before the test |

## Evidence that it is right

- A reader from the coaching domain rates 30 random pairs blind (text only against text and card).
- Every number in a card equals a value in the tool output of the same turn: 100 % on the set.
- A/B result (follow-up rate, abandonment) against the threshold fixed in step B.
- Stop rule: one wrong number shown in production, or no gain after two weeks, removes that card.
