# ADR-100: Sensitive zones are followed over time, checked, and worked on

**Status:** Accepted
**Date:** 2026-10-20
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-037](./ADR-037-injury-declaration-changes-training-retroactively.md), [ADR-068](./ADR-068-a-declared-zone-has-a-strategy-and-a-lifecycle.md), [ADR-011](./ADR-011-pmc-state-and-window-semantics.md)

---

## Context

ADR-068 gave every declared zone a strategy: `protect`, `progressive`, `correct`, `relapse_watch`.
Four gaps remained between that and what the coach did:

1. **Only `protect` was checked.** `SENSITIVE_ZONE_LOADED` read the protected zones. A knee coming
   back from a tendinopathy could get box jumps or a VO2max run, and nothing said so. The prompt
   asked for « paliers d’une semaine à l’autre », and nothing measured them.
2. **Only plan and adapt read the strategies.** `formatZoneTrainingRules` was appended to those two
   prompts. Chat and the daily briefing read the generic « Condition physique » list.
3. **The trend was the last two readings.** 3, 4, 3, 4 read « en aggravation » every other day.
   Nothing linked a worsening to the load that came before it.
4. **A worsening zone had no conduct.** The model improvised. Some answers cut the sport, some
   suggested stretching through it, and none said when to see a professional.

---

## Decision

1. **Gate rules for zones coming back** (`plan-gate/rules/zone-progression.ts`). All three are warnings,
   like every zone rule (ADR-037). They apply to zones whose strategy is `progressive` or
   `relapse_watch`.
   - `RETURNING_ZONE_PLYOMETRICS`: a `PLYOMETRIC` exercise that loads the zone.
   - `RETURNING_ZONE_PEAK_INTENSITY`: a `VO2MAX` or `RACE` session of a sport that loads it.
   - `RETURNING_ZONE_RAMP` (plan level): a week that loads the zone and plans more than 1.1× the
     TSS of the seven days before it.
   - `sensitiveZonesFrom` becomes a case of `zonesWithStrategy`. It reads the gate's clock and the
     zone's resolution date, so `relapse_watch` is decided correctly.
2. **One zone block for every prompt.** `formatZoneTrainingRules` is computed in the coach context
   (`zoneTrainingRules`) and written with the « physical » section. Chat, briefing, plan and adapt
   read the same text. Plan and adapt no longer append their own copy.
3. **Trend from a slope.** `zoneSeverityTrend` fits a least-squares slope over up to five readings
   (by reading order) and calls a change of at least one point over the span a direction. A zone that
   got worse names the TSS of the seven days before the rise, against the athlete's usual week
   (`flareLoadNote`).
4. **Conduct decided in code** (`zone-worsening-conduct.ts`). For a zone whose trend is
   `worsening`:
   - reduce the sports that load it, by 30 to 50 % in volume and with no intensity, this week;
   - add support work from the movement taxonomy (isometric, hip and core control, mobility);
   - advise a doctor or physiotherapist when severity is 7/10 or more, when the zone stops
     training, or when it has been open 21 days. Otherwise, advise one if the next reading is worse
     again.
   - The prompt block tells the model to apply this conduct, explain it, and never diagnose.

---

## Rationale

- **Warnings, not rejections.** The French-region-to-group mapping is coarse, and prehab on a zone
  is legitimate. The athlete stays the one who decides.
- **10 % ramp.** It is the usual return-to-run guidance and is simple to explain. The ramp compares
  whole weeks, because daily training stress carries no sport.
- **Slope over five readings.** It is enough to smooth one bad morning without hiding a real
  turn. With irregular check-ins, reading order is more honest than dates.
- **Fixed referral thresholds.** A model's « consult if needed » is noise; a named threshold is
  something the athlete can act on.

---

## Alternatives Considered

### Alternative 1: Reject plans that load a returning zone

**Cons:** blocks the gradual reloading the strategy asks for.
**Rejected because:** `progressive` means load it, in steps.

### Alternative 2: Let the model choose the conduct from a richer prompt

**Cons:** the same zone got different advice from one question to the next.
**Rejected because:** reliability was the point of the change.

---

## Consequences

### Positive

- The coach gives the same answer on a worsening zone in chat, briefing and plans.
- Plans that reload a returning zone too fast are flagged.

### Negative

- The ramp rule uses all sports' load, so a big swim week can warn about a knee.
- Prompts with a worsening zone grow by a few lines.

### Scientific debt created

- The 10 %, five-reading and 7/10 thresholds come from common practice, not from this athlete's
  data.
- Load per sport and per zone is not modelled.

---

## Review Criteria

- If athletes dismiss most `RETURNING_ZONE_RAMP` warnings: compare per-sport load once daily stress
  carries the sport.
- If referrals feel too frequent: raise `REFER_OPEN_DAYS` before touching the severity threshold.
