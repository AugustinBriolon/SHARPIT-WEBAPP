# Design — Contrast foreground pass (dark / light)

Binary PNG evidence for the accent/onAccent token pass.

**All athlete data in these captures is fictional.** Screens were taken against a
local ephemeral Postgres (`docker`-less apt Postgres on `127.0.0.1`) seeded with
`docs/design/contrast-foreground-pass/seed-capture-today.ts` (demo seed +
`local_fictional_capture` rename for `DEV_BYPASS_CLERK`, fresh connection stubs,
morning CAUTION verdict with `hrv_low` + `sleep_short`). No user account, no
production database, and no shared Neon branch were used. No real health data is
committed.

## Fixture surfaces (synthetic chips)

| File                               | State                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| `light-full.png` / `dark-full.png` | Full fixture page                                                 |
| `*-verdict.png`                    | Today verdict card with primary / highlight / record chips        |
| `*-signals.png`                    | Caution, risk, health-ok, recovery filled signals                 |
| `*-sports.png`                     | Solid sport chips with on-sport foregrounds                       |
| `*-destructive.png`                | Destructive + accent + highlight buttons                          |
| `*-before-after.png`               | Hardcoded white vs semantic pairs (dark mode is the failure case) |

Local HTML fixture: `fixtures/contrast-surfaces.html`. Run:
`node docs/design/contrast-foreground-pass/capture.mjs` (local `playwright`).

## Real app screens (`captures/screens/`)

Plan in the carnet IA is `/saison` (legacy `/plan` redirects there).

| File                                                         | Screen                         |
| ------------------------------------------------------------ | ------------------------------ |
| `screens/light-today.png` / `screens/dark-today.png`         | Aujourd'hui — verdict card     |
| `screens/light-nutrition.png` / `screens/dark-nutrition.png` | Nutrition — coach reading card |
| `screens/light-plan.png` / `screens/dark-plan.png`           | Plan / La saison               |

Prepare the local athlete (api `.env` loaded for `SECRET_ENCRYPTION_KEY`):

```bash
set -a && source apps/api/.env && set +a
yarn workspace @sharpit/api exec tsx ../../docs/design/contrast-foreground-pass/seed-capture-today.ts
```

Then (web + api on local DB with `DEV_BYPASS_CLERK`):
`node docs/design/contrast-foreground-pass/capture-screens.mjs`

### Copy bugs observed (not fixed in this PR)

- Section eyebrow « Les signaux » reads as a raw catalogue label next to the
  verdict plate; denser coach copy would fit the carnet tone better.
- Morning explanation can interleave frein and support clauses in one sentence
  (« …nuit trop courte, ta nuit a été réparatrice… ») when both densities fire.

### Bug found during capture

Carnet nav active tab used `text-foreground` over `bg-highlight`. In dark mode
that is snow on Lime Pulse (~1.2:1). Fixed to `text-highlight-foreground`.
