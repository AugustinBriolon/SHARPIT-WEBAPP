# Sources: Strava, Sharpit nutrition, MFP removal, HealthKit write

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship App Store–ready source story: Strava available, nutrition = Sharpit + Apple Santé, MyFitnessPal gone everywhere, then HealthKit write (nutrition + body mass).

**Architecture:** `PROVIDER_CATALOG` + `source-prefs` remain the server source of truth; iOS Priorités consumes them; landing/help mirror catalog. Sharpit is always-connected for nutrition (`IntegrationId: 'sharpit'`). MFP product surface removed (routes/UI/import); Prisma table can linger unused until a later migration.

**Tech stack:** `@sharpit/app` catalog/prefs, hub landing/help, web compte/sources, SHARPIT-APP Connections/Priorités/Nutrition, HealthKit.

## Lot 1 — Catalog + marketing + iOS surfaces

### Task 1: Catalog & prefs

- Replace `myfitnesspal` with `sharpit` on `IntegrationId`
- Catalog: remove MFP; add Sharpit (nutrition, always on); Apple Santé gains `nutrition`
- Prefs defaults: `nutrition: ['sharpit', 'apple-health']`
- `loadConnectedIntegrationIds` always includes `sharpit`
- Tests: provider-catalog, source-prefs

### Task 2: Landing / aide / privacy copy

- Strava in connected; remove MFP import band; Polar stays bientôt
- Help sources + nutrition articles without MFP
- FAQ Garmin/Strava/AH order

### Task 3: iOS Connections

- Show Strava (web-linked / disconnect if API exists)
- Priorités: nutrition shows Sharpit + Apple Santé when connected
- Remove MFP import entry from Nutrition

## Lot 2 — Purge MFP product code

- Remove connect/sync/disconnect/import handlers from api surface
- Stop cron/sync gates for MFP
- Web hub views without MFP
- iOS: delete MyFitnessPalImport*
- ADR note: MFP withdrawn (supersede 013/014/062 product-wise)

## Lot 3 — HealthKit write

- `toShare`: dietary energy + macros + bodyMass
- Update Info.plist usage strings
- Writer service + tests; help copy

## Test plan

- Unit: catalog, prefs, gates
- Manual: Priorités nutrition; Relier Strava; no MFP UI
- Later: HealthKit write permission prompt
