# Sharpit food health score (Yuka-like)

**Status:** Approved for implementation (2026-10-02)  
**Surfaces:** iOS first (selection, logged entry, food sheet); web later  
**Depends on:** ADR-061 food log + Open Food Facts
**Revised by:** [ADR-063](../../adr/ADR-063-the-food-score-explains-itself-and-reads-the-athletes-diet.md) — formula v2 (estimated Nutri-Score, additive count, ceiling, highlights, diet fit). The v1 formula below is historical.

## Goal

When an athlete looks at a food, Sharpit shows a **0–100 health score** plus composition alerts: sugar / salt / saturated fat levels, and additives with risk tiers (none / limited / high).

## Decisions

1. **Sharpit proprietary score** (not Nutri-Score alone), computed in `packages/app`.
2. **Shown everywhere on iOS** once available: portion picker, search/recent rows, logged entries, own-food sheet.
3. **Additives:** list from Open Food Facts (`additives_tags`); risk from a Sharpit E-code table.
4. **Custom foods:** **partial** score from sugar / salt / saturated fat when known; no additives.
5. **Architecture C:** shared formula in `@sharpit/app`, server stores `FoodProduct.health` JSON + exposes it on v1; iOS only renders.

## Score formula (version 1)

Weights: nutrition **60** · NOVA **20** · additives **20**.

- Nutrition: Nutri-Score A→E mapped to 0–100, then ×0.6. If Nutri-Score missing, average of nutrient-level scores (low/moderate/high) for sugars, salt, saturated fat ×0.6.
- NOVA: 1→20, 2→15, 3→8, 4→0. Missing → 10 (neutral).
- Additives: start at 20; −1 none, −3 limited, −8 high (floor 0). Missing list → 10.
- Final score rounded 0–100. Grade: ≥75 excellent · ≥50 good · ≥25 mediocre · else poor.
- Incomplete OFF (no Nutri-Score and no levels): `score: null`, `coverage: none`.
- Custom: only nutrient levels from typed per-100g values (EU solid thresholds); `coverage: partial`.

Disclaimer: « Indicateur Sharpit, pas un avis médical ».

## Data

`FoodProduct`: `saltPer100g`, `saturatedFatPer100g`, `health Json?`.

`health` shape: `score`, `scoreVersion`, `grade`, `coverage`, `nutriScore`, `nova`, `nutrientFlags`, `additives[]`.

OFF fields added: `nutriscore_grade`, `nova_group`, `nutrient_levels`, `additives_tags`, plus salt / saturated-fat in nutriments.

Invalidation: if stored `scoreVersion` < current module version, next barcode/search refresh recomputes (treat as stale).

## iOS UI (defaults)

- Compact **badge** (score or “—”): search/recent rows, entry rows.
- **Detail block** on portion page and food sheet: grade label, three nutrient flags, additive list by risk, disclaimer.
- No score on quick-add (no product).
