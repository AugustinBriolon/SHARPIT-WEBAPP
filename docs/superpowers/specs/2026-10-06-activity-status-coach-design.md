# Activity Status in coach context (P4e) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation

## Goal

Surface the athlete’s global activity status (`active` / `paused` / `injured` / `sick`) in the coach prompt so non-active modes constrain planning, without changing Core scores.

## Deliverables

1. Load `getActivityStatusStoreDb` into coach context sources; assemble a compact status payload.
2. Format an imperative section when status ≠ `active` (omit when active to keep prompts lean).
3. Include `activityStatus` in CORE request-scope sections.
4. Help article `/aide/methode/statut-d-activite`.
5. Unit tests for format + scoped inclusion.

## Non-goals

- New Core engines or sickness detectors
- Changing retention / API semantics
- iOS UI redesign
- Auto Gate rejection solely from status (existing physical / constraint paths remain)
