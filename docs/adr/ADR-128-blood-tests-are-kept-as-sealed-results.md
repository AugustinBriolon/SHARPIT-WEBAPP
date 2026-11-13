# ADR-128: Blood tests are kept as sealed results, never as a document

**Status:** Accepted  
**Date:** 2026-11-13  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

The Health page gains blood tests: the athlete imports a lab report, checks what was read, then sees
each marker against the lab's range and follows it from one test to the next.

A French lab report carries far more than markers. The two reports used to scope this work (Biogroup,
2021 and 2026, both native PDFs with a text layer) print the patient's name, birth date, birth place,
postal address, the prescriber's name and RPPS number, and the file number on every page. The
matching receipt prints the social security number.

Two existing paths would copy a blood value outside the table that holds it: `CoachTurnTrace` stores
the full system prompt and every tool output of a coach turn (ADR-117), and Langfuse, a third party,
receives the same prompts.

Reference ranges are not constants. The 2026 report states three changes of range in fourteen months
(ferritin, potassium, LDL), and ranges depend on the lab's method, the sex and the age.

---

## Decision

Keep only what the athlete confirmed, sealed, and readable through one module.

- The device extracts the results; the server never receives the document. `POST /api/v1/blood-tests`
  takes `{ sampledAt, results: [{ markerKey, value, unit, refLow, refHigh }] }` and its schema is
  strict, so no other field is accepted.
- `BloodTest { athleteId, sampledAt, sealedResults }` holds the results of one test as a single
  AES-256-GCM payload (`secret-box`). The database has no value and no marker name in clear.
- Markers are the catalog's (`@sharpit/app/lib/blood-markers/catalog`): a key, a LOINC code, one unit
  and a plausible range. A value outside that range, or in another unit, is refused as a misread.
- Each result keeps the lab's own reference bounds. The status (`low`, `high`, `in_range`,
  `no_reference`) is computed from them when the test is read, never from a range of ours.
- `queries/blood-tests` is the only module that opens a payload. `blood-tests.boundary.test.ts` lists
  its importers — the two handlers, the privacy export, the consent store — and fails on any other.
  No AI path reads a blood test.
- Writing needs the health data consent. Withdrawing it deletes the tests; account deletion cascades.
  The privacy export includes the opened results.

---

## Rationale

- A document that is never uploaded cannot leak, and needs no retention rule.
- One payload per test hides which markers were measured (a PSA or an hCG line is itself sensitive)
  and costs nothing: an athlete has a handful of tests, so the history is read by opening them all.
- The import list makes the next reader a visible decision. When the coach is given blood values, the
  change has to edit that list, and this ADR has to be superseded with how traces are kept clean.
- Storing the lab's bounds keeps an old test true to the range it was read against.

---

## Alternatives Considered

### Alternative 1: Store the PDF and re-extract on demand

**Rejected because:** it keeps the identity block and the prescriber's details for no use the product
has, and makes object storage a second place to erase.

### Alternative 2: One row per marker with the value in clear

**Pros:** SQL trends per marker.

**Rejected because:** health values would sit readable in every backup and database branch; the
volume does not need SQL.

### Alternative 3: Reuse `Observation`

**Rejected because:** observations feed the feature engines and the coach context by design, which is
the path this data must stay out of.

---

## Consequences

### Positive

- A database leak exposes sampling dates and ciphertext.
- Coach traces and Langfuse cannot contain a blood value until someone edits the boundary test.

### Negative

- Results share `SECRET_ENCRYPTION_KEY` with provider credentials: rotating it needs a re-seal of
  both. A leak of the key and the database together opens everything.
- One unit per marker: a report printed only in SI units cannot be imported yet.
- No server-side query can filter on a marker or a value.

### Open

- Whether hosting these results requires an HDS-certified host, and whether interpreting them makes
  the app a medical device, are legal questions to settle before the feature reaches production.
- LOINC codes in the catalog were written from memory and must be checked against loinc.org before
  they are used for anything but a label.
