# Periodization Qualities

> How Sharpit maps training _qualities_ (what the week develops) onto `PlanPhase`, `planFocus`, and twin signals. Complements macro phases BASE→BUILD→PEAK→TAPER→RACE — it does not replace them.

---

## Why qualities

Athletes understand « semaine seuil » better than « BUILD week 3 ». Campus-style cycle themes (VMA, seuil, force, affûtage…) are mono-quality blocks. Sharpit keeps physiological periodization (`PlanPhase`) and surfaces a **week quality** derived from `planFocus` so the athlete and the coach share the same vocabulary.

---

## Mapping quality → PlanPhase

| Quality code     | Athlete label (FR)  | Typical PlanPhase      | planFocus keywords                     | Twin cues                   |
| ---------------- | ------------------- | ---------------------- | -------------------------------------- | --------------------------- |
| `AEROBIC_BASE`   | Volume aérobie / Z2 | BASE                   | volume, endurance fondamentale, zone 2 | low ATL spike, CTL build    |
| `THRESHOLD`      | Seuil               | BUILD                  | seuil, tempo, LT2, sweetspot           | moderate–high ATL           |
| `VO2` / `VMA`    | VMA / VO2max        | BUILD–PEAK             | VMA, VO2, intervals courts             | high ATL, short sessions    |
| `RACE_PACE`      | Allure spécifique   | PEAK                   | allure course, spécificité, simulation | race-specific intensity     |
| `STRENGTH_HILLS` | Force / côtes       | BASE–BUILD             | force, côtes, PPG, pré-fatigue         | strength load + eccentric   |
| `MAINTENANCE`    | Maintien            | BASE or between blocks | maintien, volume stable                | steady CTL                  |
| `DELOAD`         | Semaine facile      | any + `isDeload`       | récupération, deload, easy week        | ATL drop priority           |
| `TAPER`          | Affûtage            | TAPER                  | affûtage, taper, fraîcheur             | volume cut, intensity short |
| `RACE`           | Course              | RACE                   | compétition, race day                  | minimal load                |
| `RETURN`         | Reprise             | BASE (constrained)     | reprise, retour blessure, progressive  | confidence gate, low ramp   |

---

## Coaching rules

1. **One primary quality per week** when generating a plan — secondary quality only as a small dose (e.g. one VO2 session inside a threshold week).
2. Prefer matching quality to `PlanPhase`: do not place heavy VMA in TAPER; do not place race-pace blocks in early BASE without justification.
3. When twin verdict is RECOVER or limiting factor is fatigue/injury, force quality toward `DELOAD` or `RETURN` regardless of calendar phase.
4. Trail / hills: prefer `STRENGTH_HILLS` or race-pace with elevation; encode in focus text so RAG and UI stay aligned.
5. Expose the quality label in athlete-facing UI (macro rail, week header) — never invent a sixth Prisma `PlanPhase`.

---

## Prompt injection hints

When building plan/adapt knowledge queries, include: phase name, quality label or focus string, practiced sports. Example: `phase BUILD seuil tempo RUN recuperation fatigue charge`.
