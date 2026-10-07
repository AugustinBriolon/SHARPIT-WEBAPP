# ADR-073: MyFitnessPal withdrawn from the product surface

**Status:** Accepted  
**Date:** 2026-10-07  
**Supersedes (product use):** [ADR-013](./ADR-013-myfitnesspal-authenticated-api.md), [ADR-014](./ADR-014-myfitnesspal-rolling-session.md), [ADR-062](./ADR-062-myfitnesspal-history-comes-from-the-athletes-export.md)

---

## Context

The provider catalog now exposes `sharpit` as the nutrition integration id instead of `myfitnesspal`. MyFitnessPal linking, sync, cron pulls, hub UI, and export import are unofficial and conflict with App Store policy and the in-app food log (ADR-061).

Athletes may still have historical `dailyNutrition` / food-log rows tagged `myfitnesspal` or `myfitnesspal_import`.

---

## Decision

1. **Remove MyFitnessPal from every athlete-facing surface** — settings hub, source prefs catalog usage in product UI, native API contract (`native-surfaces`), cron/sync, and iOS import/link flows.
2. **HTTP routes under `/api/myfitnesspal/**`, `/api/v1/myfitnesspal/**`, and `/api(/v1)/food-log/import/myfitnesspal` answer `410 Gone`** with a short message. Handlers are stubs; implementation libraries may remain for now but must not be invoked from routes, cron, or hub loaders.
3. **Nutrition is SharpIt-first** — `IntegrationId` includes `sharpit`; priorities and help docs describe the in-app journal. Strava is documented and disconnectable from the iPhone app when linked on the web.
4. **Exports** may note a legacy MyFitnessPal account row as historical, not connected.
5. **Prisma `MyFitnessPalAccount` and server adapters stay** until a later cleanup migration; no new connections are offered.

---

## Consequences

- Existing MFP account rows are orphaned until manual deletion or a future migration.
- Historical nutrition days remain readable via `nutrition-source` dedupe rules.
- ADR-013, ADR-014, and ADR-062 remain in the archive for history; new work must not reintroduce MFP product flows without a new ADR.
