# ADR-133: The macro-plan climbs toward what the race asks

**Status:** Accepted  
**Date:** 2026-11-16  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

`generateMacroPlan` took two inputs: the race date and the athlete's current CTL. Every week's
load was `CTL × 7 × phase factor`, with +3 % a week for five weeks in base and +4 % for three
weeks in build, then flat. The plan did not know which race it was written for.

Measured on a production plan (full-distance triathlon on 10 October 2027, target 12 h, 52
weeks, CTL 46):

- target load went from 315 to 361 TSS a week over the year, +15 %;
- the heaviest week of the year was 6.6 h, about half the duration of the race being prepared;
- base lasted 22 weeks, defined as « volume aérobie, endurance fondamentale »: no session
  above endurance for five months.

The week generator reads the macro-plan's phase, focus and target load, and obeys them. After
ADR-132 stopped the Gate from removing hard sessions, a generated base week still held none:
the plan asked for none.

The base focus also ended in « renforcement général ». `deriveWeekQuality` matches « renfo »
before any endurance word, so every base week reached the generator as a strength week.

External benchmarks used:

- Full-distance age-group athletes train 10 to 16 h a week at peak; the long ride is built to
  5–6 h over the last 6–8 weeks; the long run is capped at 2.5–3 h (220 Triathlon, Purple Patch,
  Triathlete).
- CTL ramp: at a CTL of 45 or below, 3 points a week or less is low risk, 4–6 moderate, 7 and
  more high (TrainingPeaks); Friel treats 4–6 as sustainable for a trained amateur.

---

## Decision

Give the macro-plan the race's demands, and make weekly volume climb toward them.

- `raceDemandsFor(raceFormat)` (`periodization/race-demands.ts`) returns the peak weekly hours
  and the long ride and long run to reach, for the formats that have a sourced figure. Today:
  full-distance triathlon — 13 h, ride 5 h, run 2 h 30. Any other format returns null.
- `generateMacroPlan` takes these demands as an optional input. With them, weekly hours go in a
  straight line from today's volume (`CTL × 7 / 55`) to the peak, reached on the last week of
  the specific phase. A steady week never asks more than 8 % over the previous one
  (`MAX_WEEKLY_RAMP`); when the race is too close, the plan stops lower and its summary says so.
- Phase split, the deload every fourth week (× 0.72), the taper's shape and step races are
  unchanged. The taper and the race week are read from the peak actually reached.
- Each growth week's focus names the long ride and long run to reach, from half their race-prep
  length at the start to the full length at the peak.
- Without demands the function returns exactly what it returned before.
- The base focus becomes volume first plus one short tempo or threshold session a week, for
  every plan, and loses « renforcement général ».

---

## Rationale

- A plan that reproduces today's load prepares the athlete for today's fitness. The quantity a
  race fixes is how much work its heaviest weeks hold; the plan should start from there.
- For the measured athlete the climb is from 5 h 45 to 13 h over 43 growth weeks: about ten
  minutes a week, roughly 1.3 CTL point a week, inside the low-risk tier. The cap only binds on
  short plans.
- Hours are the unit athletes plan their lives in, and `targetLoad = hours × 55` keeps every
  reader of the plan (week generation, the Gate's weekly-load rule, the iOS client) on the same
  fields.
- One short quality session a week in base matches the eval rubric's base band (0–10 % of
  endurance time in hard sessions) and gives the athlete's thresholds something to be measured
  on (the FTP of the same athlete had drifted down from 207 W to 170 W for lack of any hard
  effort).

---

## Alternatives Considered

### Alternative 1: Only add quality to the base phase

**Description:** Change the base focus and leave the load model alone.

**Pros:**

- A two-line change that answers the athlete's first complaint.

**Cons:**

- The plan still peaks at 6.6 h a week for a 12-hour race.

**Rejected because:** it treats the symptom the athlete saw and leaves the larger defect.

### Alternative 2: Raise the phase factors

**Description:** Keep `CTL × 7 × factor` and make build and peak factors much larger.

**Pros:**

- No new input.

**Cons:**

- The right factor depends on the gap between the athlete and the race: 2.2 for this athlete,
  1.0 for one already training 13 h. A constant cannot be both.

**Rejected because:** the missing information is the race, not a better constant.

### Alternative 3: The athlete's declared weekly ceiling first

**Description:** Ask each athlete how many hours they can hold at peak, store it, and build to
that.

**Pros:**

- The athlete's real constraint, instead of a figure per format.

**Cons:**

- Needs a profile field and a screen on iOS and the web before any plan improves.

**Rejected because:** deferred, not refused. The table's 13 h is what the measured athlete
chose when asked (12–14 h); the declared ceiling should override the table when it exists.

### Alternative 4: A split by sport

**Description:** Distribute the weekly hours between swim, bike and run, weighted by the
athlete's limiter.

**Pros:**

- The athlete's goal note says « focus vélo », and their rides are the weakest part.

**Cons:**

- The limiter lives in free text today; nothing structured states it.

**Rejected because:** needs a field first; out of this decision.

---

## Consequences

### Positive

- The measured athlete's plan goes from a 6.6 h peak to 13 h, with long sessions named week by
  week (ride 2 h 30 → 5 h, run 1 h 15 → 2 h 30).
- Base weeks reach the generator as threshold weeks with one short quality session, instead of
  strength weeks with none.
- Plans for every other format are unchanged, apart from the base focus.

### Negative

- Only one format has demands. A half-distance or marathon plan still reproduces the current
  load until its figures are sourced and added.
- The table holds one figure per format, whatever the target time: a 10-hour and a 15-hour
  full-distance athlete get the same 13 h.
- `LOAD_PER_HOUR = 55` turns hours into load for every sport and intensity alike. A week of long
  easy rides and a week of intervals of the same length get the same target load.
- Existing plans do not change by themselves: an athlete keeps the old plan until they
  regenerate it.
- The base focus changed for all athletes at once; a strength-only athlete's base weeks now
  mention tempo and threshold work the plan prompt must ignore (it already ignores endurance
  rules for them).

### Scientific debt created

- The 13 h, 5 h and 2 h 30 figures come from coaching guides and magazines, not from trials.
- The 8 % weekly cap is a rule of thumb in the spirit of the CTL ramp tiers, not a measured
  injury threshold.
- No evidence level is claimed for « one short quality session a week in base ».

---

## Review Criteria

- When the profile holds a declared weekly-hours ceiling, it replaces the table figure.
- If athletes on a climbing plan hold under 70 % of the target hours for four weeks running, the
  peak or the ramp is too ambitious for them: lower the peak rather than keep asking.
- If the Gate's weekly-load rule starts flagging most generated weeks of climbing plans, the two
  disagree on what a sustainable week is and one of them must change.
- Add a format to the table only with its sources in this file's successor.

---

## References

- ADR-083 — week qualities
- ADR-084 — B and C races are steps of the plan
- ADR-132 — the plan Gate withholds intensity only where it protects
- `packages/app/src/lib/training/periodization/periodization.ts`
- `packages/app/src/lib/training/periodization/race-demands.ts`
- TrainingPeaks, « Understanding ramp rate »:
  https://www.trainingpeaks.com/blog/understanding-trainingpeaks-ramp-rate-for-better-coaching/
- 220 Triathlon, « Ironman: how many hours of training a week do you need? »:
  https://220triathlon.com/?p=7292
- Purple Patch, « The smarter way to train for your first IRONMAN »:
  https://www.purplepatchfitness.com/freetrainingtips/your-first-ironman
- Triathlete, « Complete guide on how to train for an Ironman »:
  https://www.triathlete.com/training/triathletes-complete-guide-on-how-to-train-for-an-ironman/
