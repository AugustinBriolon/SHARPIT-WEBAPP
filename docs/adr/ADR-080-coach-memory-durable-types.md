# ADR-080: Coach Memory durable types (Files-light)

**Status:** Accepted
**Date:** 2026-10-12
**Author:** Augustin Briolon
**Supersedes:** N/A

---

## Context

SharpIt’s coach already has free-text `profileContext` (4k) and dated
`AthleteTravelContext` rows typed `TRAVEL` | `CONSTRAINT`. Bevel’s “Files”
surface is a full document system with charts — out of scope. Athletes still
need structured durable facts (injury, preference, note) that both the athlete
and the coach can write, without inventing a second product.

## Decision

- Extend `AthleteMemoryEntryType` with `INJURY` | `PREFERENCE` | `NOTE` on the
  existing `AthleteTravelContext` table (no new Files system).
- `PREFERENCE` / `NOTE` are open-ended (end date sentinel `2099-12-31`) and
  never auto-purged; the athlete (or coach tool) archives them explicitly.
- `INJURY` behaves like a dated constraint for planning restrictions; no
  location required.
- Coach tools: `listCoachMemory` (read), `upsertCoachMemoryNote` /
  `archiveCoachMemoryNote` (write, user-approval gated).
- Prompt: inject active durable entries as « Mémoire durable » beside the
  free-text « Contexte personnel ».
- UI: Coach Memory sections for travels/constraints, injuries, preferences &
  notes (French copy; no Bevel “Files” jargon).

## Consequences

- Prisma enum migration required before writes of the new types.
- Planning restriction queries must exclude `PREFERENCE` / `NOTE`.
- `profileContext` remains the free journal — not replaced.
