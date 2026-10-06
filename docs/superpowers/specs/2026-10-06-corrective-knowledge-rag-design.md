# Corrective coach knowledge RAG (P3a) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation  
**Depends on:** P1 keyword knowledge RAG

## Goal

When the first knowledge retrieval returns null (weak evidence), attempt **one** deterministic query rewrite and retrieve again. Still refuse (empty RAG block) if the retry also fails.

## Non-goals

- LLM-based query rewrite or relevance grading
- Synonym lexicons / embeddings
- Changing `COACH_KNOWLEDGE_MIN_SCORE` or Core
- More than one retry

## Design

### Rewrite rule

`rewriteCoachKnowledgeQuery(cues)` builds a fallback query from Twin cues only:

- Include: `verdict`, `limitingFactor`, `planPhase`, `sports` (same phrasing as `buildCoachKnowledgeQuery`)
- Always append load/recovery bias: `recuperation fatigue charge entrainement`
- **Omit** athlete free-text `focus` (often the source of zero hits)

If the rewritten query equals the original (after trim), skip retry.

### Retrieval wrapper

```ts
retrieveCoachKnowledgeWithCorrection(
  primaryQuery: string,
  cues: BuildCoachKnowledgeQueryInput,
): CoachKnowledgeHit[] | null
```

1. `hits = retrieveCoachKnowledge(primaryQuery)`
2. If hits ≠ null → return hits
3. `fallback = rewriteCoachKnowledgeQuery(cues)`
4. If fallback is empty or equals primaryQuery → return null
5. Return `retrieveCoachKnowledge(fallback)` (may still be null)

### Call sites

`plan` and `adapt` handlers: replace direct `retrieveCoachKnowledge(buildCoachKnowledgeQuery(...))` with the wrapper, same cues object.

### Testing

- Nonsense focus + strong Twin cues → primary null, correction hits
- Strong primary query → returns without needing different fallback content
- Primary miss + identical rewrite → null
- Double miss → null

## Success criteria

- [ ] Correction path covered by unit tests
- [ ] Plan/adapt use the wrapper
- [ ] Typed refuse still holds when both attempts fail
