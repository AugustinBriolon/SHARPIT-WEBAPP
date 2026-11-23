# ADR-146: An exercise keeps the athlete's standing note

**Status:** Accepted
**Date:** 2026-11-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-040](./ADR-040-native-api-contracts.md), [ADR-087](./ADR-087-the-coach-reads-strength-sessions-on-request.md), [ADR-121](./ADR-121-a-strength-set-is-shaped-as-it-is-done.md)

---

## Context

A strength set already carries `notes`, but that note belongs to one session: written on Monday's
squat, it is gone on Thursday's. Athletes keep notes that hold for every session of an exercise —
a cue (« omoplates serrées »), a setting (« banc cran 3 »), a pain to watch (« épaule droite : pas
sous 90° »). Bevel's November 2026 release calls them Exercise Notes. SharpIt had nowhere to put
them, and the plan generator, which prescribes the next loads from the exercise history, never saw
them.

The athlete's own words also now reach the coach chat (session and set notes, quoted as athlete
text), and the system prompt separates measured data, what the athlete felt or wrote, and past
coach recommendations.

---

## Decision

One standing note per athlete and exercise, in its own table.

- **Storage.** `AthleteExerciseNote` (`athleteId`, `exerciseKey`, `name`, `note`), unique on
  `(athleteId, exerciseKey)`. The key is `exerciseKey(name)`, the same folding (accents, case,
  spacing) the exercise history groups by, so « Développé couché » and « developpe couche » share
  one note. Additive migration; cascades with the athlete; part of the data export.
- **API.** `/api/v1/strength-exercises`: `GET` returns each exercise with `athleteNote`; `PUT
{ name, note }` writes it, an empty note removes it (name ≤ 120, note ≤ 500 characters).
- **Coach.** The strength history block given to the plan generator and the re-plan ends each
  exercise's line with « consigne de l'athlète ⟦…⟧ », as athlete text (never an instruction).
- **App.** The guided session's exercise page shows « Ma note » under the exercise's name (or
  « Ajouter une note ») and opens a sheet to write it; the exercise picker shows it under the
  history line.

A note on an exercise never logged is stored but only returned once a set of it has been saved:
the history is built from logged sets. The app keeps it for the launch meanwhile.

---

## Consequences

- Notes survive renames only when the folded name is unchanged; a different name is a different
  exercise, as it already is for the history.
- The coach chat does not read standing notes yet: it reads strength sessions on request
  (ADR-087). The plan generator and the re-plan, where loads are prescribed, do.
- Free (ADR-097): writing and reading a note is the athlete's data; only the coach's use of it is Pro.
