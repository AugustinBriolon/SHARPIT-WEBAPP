# LLM agent patterns — survey for Sharpit coach

> Patterns observed in the open `awesome-llm-apps` collection (2026).  
> Applied only where they reinforce Sharpit’s existing architecture: deterministic Core → Decision → Plan Gate → Coach LLM.

## Keep

| Pattern                                                                          | Source archetype          | Sharpit fit                                               |
| -------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------- |
| Agents only where reasoning is required; collection/normalize stay deterministic | DevPulse-style pipelines  | Matches Core vs Coach split                               |
| Typed answers + **refuse** when evidence is weak                                 | Typed agentic RAG         | Plan Gate + confidence tiers; Session Rationale citations |
| Corrective retrieve → grade → rewrite → retry                                    | Corrective RAG            | Future RAG over `knowledge/` + Decision Memory outcomes   |
| Semantic long-term memory (search before answer, write-back after)               | Mem0-style coach demos    | Extend coach memory beyond chat transcript                |
| Prompt self-improve on evals (one mutation, keep/rollback)                       | Self-improving skills     | Offline: Decision Memory outcomes as eval signal          |
| Always-on scout → rank → brief                                                   | Always-on briefing agents | Weekly coaching brief / cron quality                      |

## Skip for now

| Pattern                                           | Why                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Generic “AI health & fitness planner” dual agents | Toy demos; no Twin, no Gate                                        |
| Mixture-of-many-LLMs for every answer             | Cost and latency; Gate already arbitrates safety                   |
| Hash-chained agent trust theatre                  | Plan Gate + Decision Memory already audit recommendations          |
| Knowledge-graph RAG (Neo4j)                       | Heavy; Decision Memory + features cover athlete timeline for P0–P1 |

## Sequencing

1. **P0** — Confidence Gate refusal + evidence labels — **done**.
2. **P1** — RAG over Sharpit `knowledge/` with refusal when retrieval weak — **done**.
3. **P2** — Athlete learning memory (`buildLearningFeedback` → plan/adapt) + offline eval harness — **done**.
4. **P3a** — Corrective RAG (one deterministic rewrite retry) — in progress.
5. **P3b–d** — Chat learning memory · calibrating surfacing · weekly brief quality scout.
