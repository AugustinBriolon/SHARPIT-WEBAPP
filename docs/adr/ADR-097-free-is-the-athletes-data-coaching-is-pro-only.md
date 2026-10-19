# ADR-097: Free is the athlete's data; coaching is Pro-only

**Status:** Accepted
**Date:** 2026-10-19
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** the Free coach budget of [ADR-077](./ADR-077-extended-coach-volume-is-pro-and-counted-in-questions.md)
and the one-analysis-a-day Free trial of `narrative-trial.ts`
**Related:** [ADR-044](./ADR-044-sharpit-pro-billing.md), [ADR-095](./ADR-095-the-plan-never-runs-out-mid-training-plan.md),
SHARPIT-APP `docs/superpowers/plans/2026-10-19-pro-only-coaching-onboarding-paywall.md`

---

## Context

The Free tier gives away the product's core. A Free athlete gets the week generator, the coach
(50 000 tokens per rolling 24 h, about 6 questions, ADR-077), the morning adaptation, the daily
briefing, the automatic next week (ADR-095) and one session analysis per day. Pro adds volume and
a list of extras (weekly review, habits, nutrition reading, biological age, watch push, widgets).
The self-repairing plan, which is the positioning bet, is free, so there is little reason to pay.
Every Free athlete also costs LLM tokens every day, and the cost per athlete is still unknown.

The onboarding asks for an account before anything else. The athlete creates an account, accepts
the legal wall and then answers the wizard. The first week is generated at the end and inserted
straight into the plan. The athlete sees no price and is never asked to subscribe.

The product principle so far has been that Pro gates only what SHARPIT adds, never the athlete's
own data. Apple accepts subscription-only apps (App Review 3.1.2) when the price, the period and
the renewal are shown, terms and privacy are linked, purchases can be restored, and account
deletion stays reachable without paying (5.1.1(v)). A discounted first month is an App Store
introductory offer of the « pay as you go » type, which Apple grants once per Apple ID and
subscription group.

---

## Decision

1. **Every AI coaching surface is Pro-only.** This covers week generation and its insertion, coach
   chat, the coach's week re-plan (`coach/adapt`), session and brick compliance analysis, the
   activity narrative, the weekly review, the nutrition reading, meal description and the automatic
   next week (ADR-095). A route answers `403 { error: 'pro_required' }` (`requirePro`, the shape the
   watch push already used) before any LLM call. Background work skips Free athletes: the
   plan-horizon cron, the narrative and compliance runs after a sync. The daily briefing falls back
   to its deterministic text for a Free athlete, as it already did without the AI consent.
2. **Free is the athlete's data.** Synced activities, health, sleep, body, the journal, the manual
   food log, the calendar, and sessions already in the plan stay readable and editable without Pro.
   The deterministic readouts that exist today (training load, recovery, sleep, the rule-based
   adaptation and morning proposal, which call no model) stay Free. Nothing
   that already belongs to the athlete gets hidden behind the paywall.
3. **One onboarding exception: the first week preview.** A Free athlete whose onboarding is not
   complete (`onboardingCompletedAt` null) may run the week generator. Inserting the week needs
   Pro. The Free rolling budget caps the retries.
4. **The onboarding becomes: profile → account → consents and sources → first week → paywall.**
   - The profile steps (identity to injuries) are kept on the phone before an account exists.
   - Sign-up and the legal wall follow, and the stored answers are written to the server.
   - Privacy and sources come next, since both need the account.
   - The first week is generated and shown, then blurred, and the paywall rises.
   - Subscribing inserts the week. Closing the paywall finishes the onboarding on the Free tier.
5. **The monthly product has a 50 % first-month introductory offer**, set in App Store Connect and
   in `SharpitPro.storekit`. `SubscriptionStoreView` shows it and Apple decides eligibility. The
   server stores nothing new.
6. **The budgets of ADR-077 stay** (50 000 / 500 000 tokens per rolling 24 h). The Free budget now
   only caps the onboarding preview, so `coach/quota` answers zero questions for a Free athlete.
   The `extended-coach` perk is folded into « Coach », and « Plan qui s'adapte » joins the list.

---

## Options considered

### Option A — Keep the current Free tier and tune the quotas

This is the smallest change, but the core value stays free and the token cost of Free athletes
keeps growing with sign-ups. Lowering the quotas makes the free product worse without making Pro
more distinct.

### Option B — Hard paywall: nothing without a subscription

This gives the clearest conversion pressure and no Free cost. It breaks the data principle: a
synced athlete would lose sight of their own activities and health. App Review is also stricter
with apps that do nothing before purchase. An athlete who declines leaves the funnel with nothing
to come back to.

### Option C — Free is the data, coaching is Pro (chosen)

Pro now means the coach, which is the thing that costs money and is the positioning bet. Free stays
a useful wearable dashboard, which keeps decliners around for later offers and keeps App Review
straightforward. One preview week per account is the only LLM spend on a Free athlete.

### Option D — Free trial instead of a discounted first month

A free trial (7 days) usually converts more sign-ups, but it gives the full coach away for a week
to athletes who may never pay. The preview week already shows the value before the price. The
discount asks for a payment from day one. It can be revisited from App Store Connect without code.

---

## Consequences

### Positive

- LLM spend on a Free athlete drops to one week generation per account, from up to 50 000 tokens
  a day plus one analysis, the briefing and the ADR-095 autoplan.
- The paywall appears at the moment of highest intent: the athlete has just seen their own week
  written for them.
- One gate (`pro_required`) replaces the Free budget, the Free narrative trial and their copy.

### Negative

- Free athletes lose the coach, the generator and the daily analysis. Beta testers on TestFlight
  need a `manual` entitlement from `/admin` before the change ships.
- The web has no Stripe yet (ADR-044 §5). The web carnet calls no coaching route today; if it
  gains one, a Free athlete can only be told to subscribe from the iPhone app.
- Onboarding answers stored on the phone before an account exists are lost if the app is deleted
  before sign-up. That is accepted, because the answers are a few taps to redo.
- A lapsed Pro athlete keeps their planned sessions but gets no new week. ADR-095 stops for them.

### Neutral

- `narrative-trial.ts` (post-signup activities, one a day) becomes `narrative-access.ts`, Pro alone.
- `is-pro-athlete.ts` drops `import 'server-only'`: it is now reached from libraries the tests load
  directly, and `packages/server` is never imported by an app bundle (ADR-050).
- `pro-perks.ts` is rewritten: « Coach », « Plan qui s'adapte » and « Analyse de séance » lead the
  list, and the extras stay.
- App Store metadata must say that the coach needs a subscription.
