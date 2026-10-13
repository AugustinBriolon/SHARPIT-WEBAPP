# ADR-083: Periodization qualities and absence/pain playbooks in coach knowledge

**Status:** Accepted
**Date:** 2026-10-13
**Author:** Augustin Briolon
**Supersedes:** N/A

---

## Context

Competitive run/trail coaches (Campus Coach, Kotcha) expose mono-quality weeks and
explicit absence/pain trees. Sharpit already has Prisma `PlanPhase`, free-text
`planFocus`, digital-twin verdicts, and RAG over `knowledge/*.md`, but athletes
and the LLM did not share a stable vocabulary for _what the week develops_, nor
documented playbooks for missed weeks and pain.

## Decision

- Keep the five `PlanPhase` values; do **not** add a sixth enum for qualities.
- Encode week **qualities** (aérobie, seuil, VMA, allure spécifique, force/côtes,
  maintien, deload, affûtage, course, reprise) in
  `knowledge/periodization-qualities.md`, mapped to phase + `planFocus` keywords
  - twin cues.
- Encode absence/pain decision trees in
  `knowledge/absence-and-pain-playbooks.md` with typed actions
  CONTINUE / LIGHTEN / POSTPONE / RESTART / PAUSE.
- Extend `CoachKnowledgeQueryCues` with optional `quality` and `situation`
  (`absence` | `pain` | `return`) so plan/adapt/chat retrieval can surface these
  docs deterministically.
- Athlete UI may label the week quality derived from `focus`; generation still
  writes phase + focus as today.

## Consequences

- Rebuild `coach-knowledge-index.json` after editing those markdown files.
- Plan/adapt handlers should pass `quality` / `situation` when known.
- Session feedback and weekly wrap product work (roadmap phases 1–2, 5) consume
  the same vocabulary — no parallel taxonomy.
