# ADR-044: SharpIt Pro billing — StoreKit 2 verified by the web; the tier is derived

**Status:** Proposed
**Date:** 2026-09-24
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A — replaces the "/admin toggle only" note on `AthleteProfile.tier`
**Related:** [ADR-040](./ADR-040-ios-product-canonical-api-v1.md), SHARPIT-APP
`docs/superpowers/specs/2026-09-24-ios-corps-parametres-pro-design.md`

---

## Context

SharpIt Pro is gated by `hasProAccess(tier)`. Until now `AthleteProfile.tier` was flipped by
hand from `/admin`. The iOS app is getting a Pro page. Apple requires digital subscriptions sold
inside an iOS app to go through In-App Purchase (App Review guideline 3.1.1). The web may later
sell the same Pro through Stripe. Whatever the channel, one server-side entitlement has to decide
access, and the app must never be the authority on it.

---

## Decision

1. **A `Subscription` table is the source of truth.** It holds one row per entitlement:
   - `source`: `apple`, `stripe` or `manual`;
   - `status`: `active`, `grace_period`, `billing_retry`, `expired` or `revoked`;
   - `expiresAt` and `willRenew`;
   - for Apple: `originalTransactionId`, `environment` and `appAccountToken`.
2. **`AthleteProfile.tier` is derived, never written directly.** `recomputeAthleteTier` sets
   `PRO` while any entitlement grants it: `active` or `grace_period`, not past `expiresAt`.
   `hasProAccess(tier)` stays the only gate.
3. **The `/admin` toggle writes a `manual` entitlement.** It is active or expired, and the tier is
   then recomputed. The migration backfills a manual entitlement for every athlete already Pro.
4. **StoreKit 2 direct, verified by the web:**
   - `POST /api/v1/billing/apple/app-account-token` returns a UUID that is stable per athlete. The
     app passes it to every purchase as `appAccountToken`.
   - `POST /api/v1/billing/apple/verify { signedTransaction, signedRenewalInfo? }` verifies the
     JWS with Apple's App Store Server Library, against Apple's root certificates committed in
     `src/lib/billing/apple-root-certificates.ts`. It checks that the purchase belongs to the
     account, upserts the subscription, re-derives the tier and answers with `GET /api/v1/pro`.
   - `POST /api/billing/apple/notifications` (on `api.`) receives App Store Server Notifications V2. The route
     is public, and nothing in the payload is trusted before its signature is verified. The status
     comes from `data.status`. `REFUND` and `REVOKE` end access.
   - Sandbox transactions (TestFlight, App Review) are honoured and stored with their environment.
   - `Xcode` transactions (the app's local StoreKit configuration, not signed by Apple) are
     decoded without a signature check only when `NODE_ENV` is not `production` (`next dev`,
     vitest), so a purchase in the simulator can run end to end against a local API. Every
     build, preview or production, refuses them.
5. **Stripe for the web, later.** It will be the same table with `source = 'stripe'`. Its webhook
   writes rows and calls `recomputeAthleteTier`. Nothing else changes.

---

## Rationale

- One entitlement table makes the channels additive. Apple, Stripe and the admin toggle cannot
  overwrite each other, and a refund on one channel cannot erase a grant from another.
- A tier derived in a single function removes the class of bugs where two writers disagree.
- The App Store Server Library is Apple's official verifier: certificate chain, OCSP in
  production, bundle id and environment checks. Using it avoids a hand-rolled JWS verifier for
  money-bearing data.
- `appAccountToken` is Apple's way to tie a transaction to our account without trusting the
  device. A notification without it falls back to the account that already holds the original
  transaction.

---

## Alternatives Considered

### RevenueCat

**Pros:**

- Verification, notifications, web and app unification and analytics come as a service.
- Free under $2.5k monthly tracked revenue.
- Stripe support is included.

**Cons:**

- One more vendor, holding subscription and health-adjacent account data.
- Its webhook still has to set our tier, so part of this work remains.
- It adds cost as revenue grows.

**Why not now:** the direct path is small (three routes and one table) and keeps the entitlement
in our database. Moving to RevenueCat later would only replace the writers of `Subscription`.

### Keep the manual toggle only

**Why not:** it cannot sell anything on iOS.

---

## Consequences

**Positive:**

- The iOS Pro page can buy, restore and see its status: `renewsAt`, `expiresAt` and `willRenew`
  come from `/api/v1/pro`.
- Refunds, expiries and billing retries are reflected without human action.

**Negative / to do by hand:**

- App Store Connect:
  - create the subscription group « SharpIt Pro » (monthly and yearly);
  - set the **Server Notifications V2 URL** to `https://api.sharpit.app/api/billing/apple/notifications`
    for **both** Production and Sandbox. Since the apex moved to `apps/hub` (ADR-051), the apex URL
    still works: the hub proxies that one path to `api.`.
- Vercel: set `APPLE_APP_APPLE_ID` (the app's numeric Apple ID, needed to verify production data).
  `APPLE_IAP_BUNDLE_ID` defaults to `app.sharpit.ios`.
- Apple's root certificates change rarely. If they do, update `apple-root-certificates.ts`.
