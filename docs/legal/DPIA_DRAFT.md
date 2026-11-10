# Data protection impact assessment — draft (GDPR art. 35)

> Internal working draft, 2026-11-10. It records what the code and the production database show and
> leaves the judgment calls open. It is **not** a completed DPIA: the controller must settle the open
> points, and a privacy lawyer or DPO should review the result. Structure follows the CNIL PIA method.

## 1. Why a DPIA is needed

Sharpit meets at least three of the nine EDPB criteria, where two are enough: sensitive data (health,
art. 9), evaluation and scoring (recovery, fatigue and risk estimates), and innovative use of
technology (AI models fed with athlete context).

## 2. The processing

Described in [`PROCESSING_REGISTER.md`](./PROCESSING_REGISTER.md): activities 3 to 6 are the ones
assessed here. Scale on 2026-11-10: 12 accounts, one with substantial data.

## 3. Necessity and proportionality

| Principle          | State                                                                        | Gap                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Purpose limitation | Training assistance only; no advertising, no resale, no model training       | None found                                                                                                                 |
| Lawfulness         | Explicit health consent and a separate AI consent, timestamped and versioned | None found: the sync cron skips health-derived refresh without health consent (only the seeded demo account is recomputed) |
| Minimisation       | Derived tables keep one current row per key (ADR-125)                        | What exactly is sent to the AI models has not been audited field by field                                                  |
| Storage limitation | 14-day purge after deletion; raw Garmin pushes 7 days                        | None found                                                                                                                 |
| Information        | FR and EN policy, health disclaimer, AI transparency notice                  | None found (`v2-2026-11`)                                                                                                  |
| Rights             | Self-service export and deletion                                             | Raw streams and inference history only on request                                                                          |
| Processors         | Listed in the policy                                                         | Signed DPAs and data locations not evidenced in the repository                                                             |
| Transfers          | Database in the UK (adequacy)                                                | US vendors (Clerk, Resend, AI providers): transfer mechanism to confirm                                                    |

## 4. Risks to athletes

Severity and likelihood are the controller's to rate; the entries below are the facts to rate them on.

| Risk                       | What could happen                                       | Existing measures                                                           | Open points                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Illegitimate access        | Health, journal or location data read by a third party  | Clerk auth, athlete-scoped queries, encrypted provider tokens, safe logging | No column-level encryption; console access and MFA not documented; public DB endpoint (no IP allow-list)                                                                                         |
| Unwanted disclosure to AI  | More context than needed reaches a model provider       | Hard consent gate, traces in the EU, erased with the account                | aggregate load indicators still count Strava-only sessions (the sessions themselves are excluded, ADR-126); field-level audit of prompts; providers' retention and no-training terms to evidence |
| Data kept too long         | Data survives its purpose or a deletion                 | Cascade delete, purge cron, 24 h database history                           | None since the pre-purge Neon backup branch was deleted on 2026-11-10; no rule yet bounds the life of future backup branches                                                                     |
| Wrong inference acted upon | An athlete trains through an injury on a wrong estimate | "Estimate, not diagnosis" notices; deterministic gates on recommendations   | Fatigue and adaptation models read duplicated history until ADR-125 ships                                                                                                                        |
| Loss of data               | Athlete history lost                                    | Neon history (24 h), export                                                 | No backup beyond 24 h — acceptable or not is a controller decision                                                                                                                               |

## 5. Action plan

| Action                                                             | Status           |
| ------------------------------------------------------------------ | ---------------- |
| One current row per key in derived tables; purge raw Garmin pushes | Done, ADR-125    |
| Export covers every table or states why not                        | Done             |
| Policy names Strava, Resend and the database location              | Done             |
| Delete the pre-purge Neon backup branch                            | Done, 2026-11-10 |
| Inactive accounts: notice at 23 months, deletion at 24             | Done             |
| Collect signed DPAs, locations and transfer mechanisms             | Open             |
| Audit the context sent to AI models field by field                 | Open             |
| Keep Strava-only activities out of AI paths                        | Done, ADR-126    |
| Policy `v2-2026-11`, re-acceptance required                        | Done             |
| Confirm that HDS-certified hosting is not required                 | Open (lawyer)    |
| Have this DPIA reviewed and signed off                             | Open             |
