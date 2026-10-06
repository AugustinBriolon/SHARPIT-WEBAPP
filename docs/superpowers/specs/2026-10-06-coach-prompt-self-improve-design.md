# Offline coach prompt self-improve (P4d) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation

## Goal

Run one deterministic prompt mutation offline, score it against fixed rules, and keep only if the score rises. Never overwrite production prompts without an explicit candidate write.

## Deliverables

1. Pure module `packages/server/src/lib/coach/prompt-improve/` — score, mutate (catalog), evaluate keep/rollback.
2. Script `yarn api eval:coach-prompt-improve` with golden fixtures (improve → keep, weaken → rollback).
3. Optional `--write-candidate` writes the kept text under `apps/api/.bench/` only; never patches source.
4. CI step alongside existing coach offline evals.

## Non-goals

- LLM-as-judge or billed benches
- Runtime / in-prod mutation
- Auto-merge into `coach-system-prompt.ts`
- Activity Status (P4e)
