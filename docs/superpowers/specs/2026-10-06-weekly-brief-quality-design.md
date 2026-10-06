# Weekly brief quality scout (P3d) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation

## Goal

Deterministic quality scoring of `WeeklyCoachingBriefViewModel` so we can catch degraded briefs offline without an LLM scout.

## Design

`scoreWeeklyBriefQuality(vm)` returns `{ score: 0–100, flags: string[] }`.

| Flag                      | Deduction                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `empty_state`             | Cap score at ≤25 after other deductions (degraded week is expected but not “rich”) |
| `missing_plan_week`       | −20                                                                                |
| `missing_goal`            | −10                                                                                |
| `missing_load`            | −15                                                                                |
| `no_key_sessions`         | −15                                                                                |
| `missing_recovery`        | −10                                                                                |
| `missing_limiting_factor` | −10                                                                                |
| `no_learning_feedback`    | −5                                                                                 |

Start at 100; clamp to `[0, 100]`. Empty-state briefs still receive flags for transparency.

## Offline harness

`yarn api eval:weekly-brief` — golden fixtures → assert expected score/flags → report under `apps/api/.bench/`.

## Non-goals

- Cron / production auto-rewrite
- LLM grading
- Changing the brief ViewModel shape
