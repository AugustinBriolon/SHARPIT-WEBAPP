# ADR-082: A race goal is entered as structured values, bounded by a server catalog

**Status:** Accepted
**Date:** 2026-10-13
**Author:** Augustin Briolon
**Supersedes:** N/A (extends [ADR-081](./ADR-081-race-finish-projection-v2.md))

---

## Context

A race goal held its format and target as free text (`raceFormat` « Half Ironman »,
`targetPerformance` « Sub 5h30 »). The projection (ADR-081) guessed the race from regexes and
knew only triathlons and road runs; nothing stopped « L in 2 h »; a trail's climbing, a
cyclosportive, a swim, a duathlon or a swimrun could not be said at all.

## Decision

- `Goal` gains optional structured columns: `discipline` (`RaceDiscipline`: RUN, TRAIL, BIKE,
  SWIM, TRIATHLON, DUATHLON, SWIMRUN), `formatKey`, `swimM`, `bikeM`, `runM`, `run2M` (duathlon
  second run), `segments` (swimrun), `bikeElevationM`, `runElevationM`, `openWater`,
  `targetSeconds` (migration `20261013140000_goal_structured_race`).
- One pure catalog, `packages/app/src/lib/goals/race-formats.ts`, served as
  `GET /api/v1/goals/race-formats`: per format its label, prefilled distances, whether they are
  editable, the D+ fields to ask, a notes placeholder and hard `targetBounds`. It is the single
  source of race distances: triathlon S–XXL come from the projection's format specs, and
  `triathlon-format.ts` (activity titles) reads its letters from it. Formats: RUN 5K/10K/semi/
  marathon/custom; TRAIL and BIKE custom (D+ required); SWIM 1.5/3/5/10 km/custom; TRIATHLON
  XS/S/M/L/XL (3/120/30, editable — XL varies by race)/XXL/custom; DUATHLON S 5/20/2.5,
  M 10/40/5, L 20/80/10 (FFTri reference, races vary ±20 %)/custom; SWIMRUN custom.
- Bounds = distances × a pace envelope per discipline, fast ≈ world-class, slow ≈ usual cut-offs:
  run 2:30–10:00/km; trail 3:00–12:00 per km-effort; bike 45–12 km/h flat-equivalent (20 km/h
  in multisport); swim 0:55–3:30/100 m (swimrun 1:05–4:00); transitions 1–20 min (duathlon
  0:45–15 min, swimrun 0–2 min per segment). Climbing becomes flat-equivalent distance: on foot
  100 m D+ ≈ 1 km, on a bike 1000 m D+ ≈ 15 km (≈ 900 m/h climbing, half won back descending).
- Goal create/PATCH settle the structured race over the stored goal (`settleStructuredRace`):
  a fixed format's distances come from the catalog, an editable one's from the athlete; missing
  legs, missing D+ for TRAIL/BIKE or an unknown key → 422 `{ error }`; a target outside the
  bounds → 422 `{ error, minSec, maxSec }`. `raceFormat` / `targetPerformance` are written from
  the structured values (« Triathlon L », « Trail · 42 km · 2500 m D+ », « Sub 5h30 ») for older
  clients and the coach prompt. An older client changing only the free text clears the
  structured values it contradicts.
- The projection reads complete structured values first, the free text otherwise. Road runs and
  S–XXL triathlons without D+ project exactly as before. Added:
  - Climbing on any run or bike leg through the flat-equivalent rule above; custom triathlons and
    bike-only races take the race defaults (transitions, IF, brick, HR) of the nearest S–XXL spec.
  - TRAIL: the run model on the km-effort distance. BIKE: median long ride (else FTP) × the
    climbing factor. SWIM: CSS × Riegel from 1500 m × 1.03 in open water (no wetsuit assumed),
    × 1 in a pool; a pool triathlon swims at CSS × 1.
  - DUATHLON: both runs priced as one effort over their total distance, split by distance, the
    second × the nearest format's brick factor; T1 1:15, T2 1:00 (or past races' T2).
  - SWIMRUN: swim at CSS × 1.1 (shoes) + 30 s per segment; run on km-effort × 1.1 (terrain).
- `POST /api/v1/goals/projection-preview` projects a race not saved yet for the form and returns
  `{ projection, verdict, verdictLabel, targetBounds }`: target faster than `lowSec − 3 %` →
  ambitious, within `[lowSec − 3 %, highSec]` → realistic, slower → cautious. It never writes.
- `apps/api/scripts/backfill-structured-goals.ts` (dry-run unless `--apply`, `--athlete`/`--all`)
  maps existing race goals the regexes recognise (TRI_S…TRI_XXL, RUN_5K…RUN_MARATHON) and their
  target when it parses within bounds; their free text is kept.

## Rationale

Values the model understands beat guessing text, and a server catalog keeps iOS, the coach and
the projection on the same distances. Bounds only block the impossible; the soft verdict, not a
refusal, tells the athlete how a target sits against their form. Flat-equivalent distance keeps
one run and one bike model for every terrain instead of a model per discipline.

## Consequences

- iOS builds one race form from the catalog (cached) and the preview; older clients keep working
  on the legacy strings.
- The preview loads the same evidence as a live projection (one query set per call); clients
  debounce it.
- Envelopes, climbing rules and swimrun/duathlon factors are documented approximations, to be
  backtested once structured races with results exist.
- `GET /goals/race-formats` reads no athlete data.
