# Day load vs training status vocabulary (P4b) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation

## Goal

Keep coach copy and athlete help from conflating a hard day with a long-horizon training status (overreaching / form / PMC).

## Deliverables

1. Help article `/aide/scores/charge-du-jour-et-statut` (French, `###` only, no em dash), linked from `effort` and `charge-et-forme`.
2. Shared coach line constant injected into PMC context and the chat system prompt.
3. Unit tests asserting the distinction appears in both surfaces.

## Non-goals

- New Core scores or Strain formulas
- iOS copy this slice
- Activity Status (P4e)
- Rebuilding knowledge index (glossary entry already indexed)
