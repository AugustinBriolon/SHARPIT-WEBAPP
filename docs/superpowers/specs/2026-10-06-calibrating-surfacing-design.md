# Calibrating surfacing (P3c) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation

## Goal

Surface an explicit French **« en calibration »** state in the coach decision context when Decision confidence is inadequate, so the LLM avoids hard prescriptions during cold start / low-trust windows.

## Behaviour

1. `confidenceTier` ∈ {`LOW`, `INSUFFICIENT`} → append calibrating line in the decision section (even when a normal verdict is shown).
2. `verdict === INSUFFICIENT_DATA` → instead of an empty decision section, emit a short calibrating-only section (no invented verdict).
3. Evidence label for `decision.confidenceTier` mentions calibration.

## Non-goals

- New Core score or training-status enum
- UI card on Today (coach context + evidence labels only this slice)
- Changing Plan Gate rejection rules (already P0)
