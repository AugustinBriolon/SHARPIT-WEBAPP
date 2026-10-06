# Remove hike-trip séjours from the product

**Date:** 2026-10-06  
**Status:** Implemented (web/API; iOS tracked separately)  
**Scope:** Séjours de randonnée only — not coach travel / déplacements

## Problem

Grouping several hikes into a « séjour » dossier is out of Sharpit’s core scope.

## Decision

**Product + API removal; keep the database table.**

- Delete athlete-facing and coach-API paths that create, list, edit, or show hike trips.
- Leave `HikeTrip` / `Activity.hikeTripId` in Prisma unchanged.
- Do **not** touch travel context.

## Removals

### iOS

- `Features/Activity/HikeTrips/`, `Networking/V1HikeTrips.swift`
- Entry, menu, sheets from Activité / détail
- Related tests and CLAUDE docs

### Web / API

- Handlers, routes (`/api/hike-trips`, `/api/v1/hike-trips`), queries, validators, summary helpers
- `native-surfaces` entries, activity `hikeTrip` include/header fields
- Séance quiet line + hub help articles

### Kept

- Prisma `HikeTrip` model
- Archive design docs under `docs/archive/`

## Success criteria

1. No UI path to create/open/link a séjour
2. No public hike-trips HTTP routes
3. Help copy no longer documents séjours
4. Travel unchanged; DB rows inert but intact
