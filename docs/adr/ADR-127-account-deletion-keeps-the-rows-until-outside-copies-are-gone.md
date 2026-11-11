# ADR-127: Account deletion keeps the rows until the outside copies are gone

**Status:** Accepted  
**Date:** 2026-11-11  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

An account's personal data lives in three places: Postgres, the Clerk identity (e-mail, name) and the
Langfuse coach traces (athlete context, health data included). The daily `privacy-purge` cron erased
all three, but it logged a failure of Clerk or Langfuse and carried on, then deleted the Postgres rows.

Two consequences showed up while checking the deletion of ten test accounts on 2026-11-11:

- A failed outside erasure was invisible: the cron answered 200, and the only trace was a line in the
  Vercel logs. The athlete's id was then gone from Postgres, so nothing could ever retry it.
- Langfuse Cloud removes `GET /api/public/traces` on 2026-11-16 and already answers 410 on part of
  its calls. The trace erasure read that endpoint to find what to delete, so it would have failed for
  every account from that date, silently.

Provider revocations (Strava, Google, Withings) had the same shape: a refusal was logged, then the
tokens were wiped, so the grant stayed active at the provider with no way to retry.

---

## Decision

Make an incomplete deletion visible and retryable.

- The purge deletes a profile's rows only once its Clerk identity (a 404 counts as gone) and its
  Langfuse traces are both erased. When one fails, the profile stays — already unusable, credentials
  wiped — and the next daily run retries.
- Every failed step e-mails the controller, once per run, with the athlete id, the step and what to
  do by hand. The cron answers 500 with `failedErasures` in the body.
- A provider revocation that fails is e-mailed too, since it cannot be retried after the tokens are
  wiped. So is a trace erasure that fails on the sign-back-in path, where the rows go regardless
  because the identity is about to own a fresh profile.
- The Langfuse erasure lists traces through `GET /api/public/v2/observations` and deletes them with
  the batch `DELETE /api/public/traces`, which Langfuse keeps.

---

## Rationale

- An erasure that cannot be seen failing is not an erasure the controller can answer for (GDPR art.
  17 and 5(2)). The profile row is the only handle on the outside copies; deleting it first removes
  the means to finish the job.
- The v2 read was run against the real Langfuse API before shipping: 200, `traceId` on each row, and
  a cursor to follow.

---

## Alternatives Considered

### Alternative 1: Delete the rows anyway, and only alert

**Description:** Keep the current order and add the e-mail.

**Pros:**

- Postgres data, the largest and most sensitive copy, is gone at once
- No retry state

**Cons:**

- The controller must clean Clerk or Langfuse by hand, from an athlete id that only the e-mail still
  holds

**Rejected because:** the alert would be the only record, and an e-mail that is not sent loses it.

### Alternative 2: A table of pending outside erasures

**Description:** Delete the rows, and record each failed step in a new table that the cron retries.

**Pros:**

- Rows leave Postgres at once, and retries still happen

**Cons:**

- A new table and a second retry path for what the profile row already expresses

**Rejected because:** `deletedAt` on the profile already marks an unfinished deletion.

---

## Consequences

### Positive

- A stuck deletion produces an e-mail, a 500 on the cron and a profile still present in
  `AthleteProfile` with `deletedAt` set: three independent signals
- Langfuse trace erasure keeps working after 2026-11-16

### Negative

- While Clerk or Langfuse keeps failing, the account's Postgres data stays, though unusable, and the
  controller is e-mailed every day until it is fixed
- A Clerk 404 counts as gone, so an identity living in another Clerk instance is never deleted and
  nothing flags it
- The alert e-mail depends on Resend: without it the signals are the 500 and the surviving profile
- The ten accounts purged on 2026-11-11 went through the earlier code: whether their Clerk identities
  and traces were erased was not recorded

### Scientific debt created

- None

---

## Review Criteria

- If a step fails for more than a few days with no way to fix it, add a cap after which the rows are
  deleted anyway and the outside copy is handled by hand.
- If Langfuse changes the batch delete endpoint, the erasure fails loudly (an e-mail), by design.
