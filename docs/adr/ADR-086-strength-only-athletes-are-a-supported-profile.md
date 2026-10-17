# ADR-086: Strength-only athletes are a supported profile

**Status:** Accepted
**Date:** 2026-10-17
**Author:** Augustin Briolon
**Amends:** the "endurance-first" rule of `docs/superpowers/specs/2026-09-01-practiced-sports-design.md`

---

## Context

Practiced sports were designed endurance-first: run, bike, swim and triathlon are core; strength,
mobility and stretching are complements. Two places enforced it:

- `normalizeAthletePracticedSports` (read path) turned any selection without a core sport into
  all four core sports, so an athlete who saved `['strength']` was read back — by the coach
  context and the plan gate — as a run/bike/swim/triathlon athlete.
- The iOS onboarding refused to leave the Sports step without an endurance sport, so a person who
  only lifts could not finish sign-up at all.

New users who only want the app for strength training hit this wall on day one.

## Decision

A selection made of strength alone (optionally with mobility and stretching) is a real profile.

- `normalizeAthletePracticedSports` keeps any non-empty valid selection as saved. Only a null,
  invalid or empty value still defaults to all core sports (existing athletes are not blocked).
- The plan generator prompt (`handlers/coach/plan`) gets a rule for an athlete with no endurance
  sport: STRENGTH sessions (plus mobility if practiced), split by muscle group with recovery
  between sessions on the same muscles, progressive overload in volume then load; 80/20, TSB and
  HR/pace/power targets do not apply.
- The coach's allowed activity types already derive from the selection
  (`coachActivityTypesForPracticed` gives `STRENGTH` only), so the plan gate rejects endurance
  proposals for such an athlete with no further change.
- iOS onboarding accepts strength alone (`PracticedSportCatalog.isPlannable`); mobility or
  stretching alone is still refused — they are not a programme. A strength-only athlete is offered
  a palier goal (no race) and does not see the endurance thresholds page.

## Options considered

### Option A — Keep endurance-first, add a "strength" core sport alias

Treat strength as a core sport only for this purpose. Pros: no change to the "core" vocabulary.
Cons: strength would be both core and complement, every filter using `CORE_PRACTICED_SPORTS`
would need a special case, and the read path would still need the same change.

### Option B — Keep any non-empty selection on read (chosen)

Pros: one-line change on the read path; the coach and plan gate already follow the selection;
the endurance defaults for legacy null rows are unchanged. Cons: an athlete who only ticks
strength gets no endurance proposals at all, even if they later run — they must add the sport.

### Option C — Status quo

Pros: no work. Cons: strength-only users cannot sign up on iOS and are mis-coached on the web.

## Consequences

### Positive

- A strength-only user finishes onboarding and gets a first week of strength sessions.
- The coach and plan gate stop proposing run/bike/swim to someone who never chose them.

### Negative

- Endurance-centric surfaces (training load, race projection) stay empty for these athletes rather
  than being redesigned for strength; they are data-driven and simply show nothing.

### Neutral

- `hasCorePracticedSport` is no longer used by the read path; it stays exported for callers.

## References

- `packages/app/src/lib/practiced-sports/catalog.ts`
- `packages/server/src/handlers/coach/plan/handler.ts`
- iOS: `SHARPIT-APP/Features/Profile/EquipmentView.swift` (`PracticedSportCatalog`)
