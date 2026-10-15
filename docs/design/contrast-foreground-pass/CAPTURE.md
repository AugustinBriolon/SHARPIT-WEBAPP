# Design — Contrast foreground pass (dark / light)

Binary PNG evidence for the accent/onAccent token pass. Example data only
(fixture HTML, no live athlete session).

| File                               | State                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| `light-full.png` / `dark-full.png` | Full fixture page                                                 |
| `*-verdict.png`                    | Today verdict card with primary / highlight / record chips        |
| `*-signals.png`                    | Caution, risk, health-ok, recovery filled signals                 |
| `*-sports.png`                     | Solid sport chips with on-sport foregrounds                       |
| `*-destructive.png`                | Destructive + accent + highlight buttons                          |
| `*-before-after.png`               | Hardcoded white vs semantic pairs (dark mode is the failure case) |

## Capture method

Local HTML fixture (`fixtures/contrast-surfaces.html`) with `:root` / `.dark`
token blocks from `packages/ui/src/styles/globals.css`, rendered via Playwright

- Chromium. Run: `node docs/design/contrast-foreground-pass/capture.mjs`
  (requires a local `playwright` install).
