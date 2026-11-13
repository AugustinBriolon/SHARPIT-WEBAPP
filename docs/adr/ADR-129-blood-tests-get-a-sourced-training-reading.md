# ADR-129: Blood tests get a sourced training reading, computed without a model

**Status:** Accepted  
**Date:** 2026-11-14  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

Blood tests are stored as sealed results with the lab's own bounds (ADR-128). A lab range says
whether a value is unusual for the general population; it does not say what training does to it.
Several markers move with exercise or with an athlete's build, and an athlete reading « Haut » next
to ASAT after a hard week has no way to tell an effort from a problem.

The athlete chose (2026-11-14) to read blood values with deterministic rules only, and to keep the
coach away from them for now: no value reaches a model, so ADR-128's boundary holds unchanged.

---

## Decision

Add a Pro route, `GET /api/v1/blood-tests/[id]/reading`, that crosses one test's results with the
sessions recorded before its sample and returns sourced findings.

- `athleteReading` (`@sharpit/app/lib/blood-markers/athlete-reading`) is pure: results and
  `TrainingBeforeSample` (sessions in the 7 and 28 days before, strength in the 7) in, findings out.
  `trainingBeforeSample` counts the athlete's activities on the server.
- A finding names its markers, a tone (`context`: training can explain it; `doctor`: show it to a
  doctor), its text and its source. Doctor findings come first. Nothing is called normal or
  abnormal beyond the lab's own bounds.
- The route answers `pro_required` below Pro (ADR-097: values, ranges and history stay free; the
  reading is what SHARPIT adds). It is computed on each request and stored nowhere.
- `blood-tests.boundary.test.ts` lists the only importers of the reading module (the route and the
  training count), as it does for the blood test queries.

The rules and their sources:

| Finding                      | Rule                                                                                                                                                                                                                                                  | Source                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Transaminases after training | ASAT or ALAT above the lab range with ≥ 1 session in the 7 days before: muscular effort can raise them for at least 7 days; a GGT in range supports a muscular origin; retest after a week without hard sessions. Without a recorded session: doctor. | Pettersson J. et al., Br J Clin Pharmacol 2008;65(2):253-259     |
| Ferritin low for an athlete  | Ferritin < 35 µg/L, even inside the lab range: stage 1 iron depletion in athletes. With a low haemoglobin: doctor.                                                                                                                                    | Sim M. et al., Eur J Appl Physiol 2019;119:1463-1478             |
| White cells low and trained  | Neutrophils or leukocytes below the lab range, no lower than 80 % of its bound, with ≥ 8 sessions in the 28 days before: a mild resting drop is described in endurance-trained athletes; judge on a second test. Otherwise: doctor.                   | Blannin A.K. et al., Br J Sports Med 1996;30(2):125-129          |
| Creatinine and muscle mass   | Creatinine above the lab range, or creatinine eGFR < 90: creatinine follows muscle mass and recent effort and its eGFR is less reliable in athletes; compare with rested tests, cystatin C if it persists.                                            | Banfi G., Del Fabbro M., Lippi G., Sports Med 2009;39(4):331-337 |

---

## Rationale

- Each rule restates a published finding and a conservative next step (retest, compare, doctor);
  none sets a target or a treatment.
- The 35 µg/L ferritin floor is Sim 2019's; Clénin et al. (Swiss Med Wkly 2015) use 30 µg/L. The
  higher floor errs towards telling the athlete.
- « Sans séance enregistrée dans SHARPIT » rather than « sans séance »: a missing session may be an
  unconnected source, and the text must not claim more than the data.

---

## Alternatives Considered

### Alternative 1: Let the coach read the results

**Rejected because:** the values would reach a model provider and land in `CoachTurnTrace` and
Langfuse; the athlete deferred that decision (ADR-128 stays in force).

### Alternative 2: Compute the reading on the iPhone

**Rejected because:** the training count lives on the server, the web would need the same rules,
and a rule change would wait for an App Store release.

### Alternative 3: Flag a change between two tests as significant

**Deferred:** a reference change value needs each marker's analytical and within-subject variation
(EFLM biological variation database); writing them without that source would invent precision.

---

## Consequences

### Positive

- An athlete sees why a « Haut » may be the week's training, with the paper behind it.
- The coach and every AI path still never read a blood value.

### Negative

- Sessions are counted, not weighed: a long ride and a short jog count the same.
- `Activity.date` is the wall clock stored as UTC for some sources, so a session on the morning of
  the sample may fall on either side of it.
- Four rules only; lipids, thyroid and the rest get no reading.

### Open

- The legal questions of ADR-128 (HDS hosting, medical-device qualification) apply even more to an
  interpretation and must be settled before release.
