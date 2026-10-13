# ADR-081: One server-side race finish projection (v2), frozen on race eve

**Status:** Accepted
**Date:** 2026-10-13
**Author:** Augustin Briolon
**Supersedes:** N/A

---

## Context

iOS recomputed a crude triathlon finish (`GoalAnalyticsEngine.computeTriathlonFinish`) while a
richer server model (`buildRaceFinishProjection`) sat unused. Backtest on the Versailles Half
(2026-10-11, real 5:40:02): the iOS model said 6:05:25 — run +19:45 (stale profile threshold
× 1.08), swim +11:14 (CSS × 1.07 « open-water penalty »), transitions −12 min (fixed 2:06/1:19).

## Decision

- One pure model, `buildRaceProjection` (`packages/app/src/lib/goals/goal-race-projection.ts`),
  added as `projection` to every goal payload (GET/POST `/goals`, GET/PATCH `/goals/[id]`)
  by `withRaceProjection` (`packages/server/src/lib/goals/race-projection.ts`). The old model
  (`predictTriathlonFinish`, sample collectors) is deleted.
- Per leg, the most specific evidence wins — `history` (past linked races) › `recent` (training)
  › `profile` › `default` — and fallbacks add a French hint to `missing`. Run and bike read
  _capacity_, not training pace (`goal-race-capacity.ts`), and each leg says how (`method`):
  - Run: the faster of (a) `hr-curve` — Theil–Sen line of pace vs average HR over 26 weeks
    (≥ 5 runs ≥ 3 km with HR, falling pace, |r| ≥ 0.4, else discarded), bounded at 0.97 × (b),
    read at race HR = factor × LTHR (else × 0.935 × max HR), at most
    15 bpm above the hardest training HR; factors: sprint 1.0, olympic 0.97, half 0.93,
    full 0.88, 5 km 1.02, 10 km 1.0, semi 0.95, marathon 0.9 — and (b) `decayed-best` — the
    fastest Riegel'd reference (3 km / 0.2× … 3× the race distance) over 26 weeks, each slowed
    by 0.5 % per 4 weeks of age; then × a brick factor (sprint 1.02, olympic 1.03, half 1.04,
    full 1.06). Profile threshold (≈ 15 km pace, Riegel'd) only as last fallback.
  - Swim: past race pace per 100 m, else CSS × 0.98 (wetsuit open water), on the format distance.
  - Bike: `median` long-ride speed (≥ 0.35× race distance), 12 weeks if ≥ 3 rides there, else
    all; FTP × IF through the flat-road power model below 3 rides.
  - T1/T2: median of past races, else amateur defaults (half 6:00/4:00, olympic 4:00/2:30,
    sprint 3:00/2:00, full 8:00/5:00) — half 7:00/4:30, closer to big-park amateur reality.
- Range ± 6 / 4.5 / 3 % for `low` / `medium` / `high` confidence = share of legs on measured
  evidence (< 0.4 / ≥ 0.4 / ≥ 0.8).
- Dynamic: `todaySec` is the level above if the race were today; `finishSec` is the race-day
  projection (`packages/app/src/lib/goals/goal-race-progression.ts`, pure):
  - `regularity` (0..1, null without data) over 8 weeks = 0.6 × plan adherence (`adherence()`,
    done / due planned sessions) + 0.4 × (1 − CV of weekly training time, all sports).
  - Per-leg trend over the 12-week window: least-squares slope of leg-equivalent time, relative
    to its mean, fitted on a weekly series smoothed by an EWMA (α 0.4) so one session neither
    jumps in nor drops out (run: weekly fastest Riegel'd reference; bike: weekly median of race
    distance / long-ride speed; swim: none, no swim evidence is loaded). Needs ≥ 3 weekly points
    over ≥ 3 weeks.
  - rate = clamp(trend × (regularity ?? 0.5), ±1 %/week); change = clamp(rate × weeks to race,
    −6 %, + min(6 %, slowdown observed over the window)); race-day leg = today's leg × (1 + change).
    `trend.secPerWeek` = Σ leg × rate (null without any trend).
  - The range widens with irregularity: half-width × (1 + 0.5 × (1 − regularity)).
- `GoalProjectionSnapshot` (unique goal × ISO week, cascades with the goal) stores the week's
  `finishSec` / `todaySec` and the whole live projection (`payload`, `computedAt`) of every race
  still ahead — no cron. Reads serve that payload for the rest of the ISO week and recompute
  (upserting the row) only when it is missing, when the goal or any of the athlete's activities
  was updated after `computedAt` (one `max(updatedAt)` query), or on the race's eve (freeze).
  Payloads carry `history` (last 16 weeks, oldest first).
- `Goal.frozenProjection` / `frozenProjectionAt`: the first read from the race's eve on stores
  the projection, computed with evidence cut at race-day start; payloads then serve it (the
  « Prévu ») with `frozenAt`.

- Structured race goals ([ADR-082](./ADR-082-a-race-goal-is-entered-as-structured-values.md)):
  when a goal carries its discipline and distances, the projection reads them instead of the
  free text, and covers trail, bike, swim, duathlon and swimrun.

## Rationale

Prod backtest of the first v2 (Versailles Half): 6:12:30 for 5:40:02 — run +20 min, because the
athlete trains easy and training pace understated race capacity; and the hard 12-week window
made the as-of projections jump (5:30 → 6:10 between 8 and 4 weeks out) and the trend explode.
Hence capacity read off HR curves, age decay instead of a cut-off, and a smoothed trend.
The second prod backtest (LTHR 169) put a bike HR curve at ≈ 35 km/h for a real 27.4 (−43:42):
speed depends on terrain and wind, so HR → speed does not transfer to race HR. The bike is back
to the median long ride (+≈ 1:46 normalised), and the run curve is bounded by the best reference.

The fastest recent reference, not the closest one, because easy long runs say little about race
pace. The trend is weighted by regularity because a progression built on sporadic training is
the least likely to carry on; caps keep a few good sessions from promising minutes. A swim factor « vs CSS » from past races would be measured against today's CSS and reduce
to the past pace itself, so the pace is used directly. Same backtest fixture: v2 ≈ 5:47:40.

## Consequences

- iOS must drop `computeTriathlonFinish` and render `projection`.
- Vercel Hobby CPU: the full evidence load below runs at most once per goal and week, plus once
  per activity change. Goal reads with a live race projection to recompute run one extra query set (profile, weight, runs,
  run bests, long rides, linked races); frozen or non-race goals add none.
- The run evidence window is 26 weeks.
- They also load the planned sessions and activity durations (regularity), read
  the goal's weekly snapshots, and write at most one snapshot per goal and week.
- `apps/api/scripts/backtest-race-projection.ts` prints v2 next to the old iOS model, then
  today / race-day replays 8, 4 and 0 weeks before the race, each with a distance-normalised
  score (model pace × real leg distance) and the run/bike `method`.
