# Record of processing activities (GDPR art. 30)

> Internal document, not published. Built from the code and the production schema on 2026-11-10.
> Cells marked **to confirm** are facts the code cannot show; the controller fills them in.
> The athlete-facing text is [`PRIVACY_PAGE_FR_V0.md`](../../apps/hub/content/legal/PRIVACY_PAGE_FR_V0.md).

## Controller

Named in section 1 of the privacy policy (natural person, publisher of Sharpit). No DPO appointed:
**to confirm** that none is required (art. 37 — no large-scale processing of health data today).

## Processing activities

| #   | Activity                   | Purpose                                            | Legal basis                                         | Data                                                                                                                          | Art. 9 | Retention                                            |
| --- | -------------------------- | -------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------- |
| 1   | Account and authentication | Create and secure the account                      | Contract                                            | E-mail, first and last name, technical id (Clerk); consents and their dates                                                   | No     | Life of the account; erased 14 days after deletion   |
| 2   | Athlete profile            | Personalise training                               | Contract                                            | Height, birth date, sex, thresholds, sports, equipment, home location, goals                                                  | No     | Same as 1                                            |
| 3   | Health and training sync   | Compute load, recovery, sleep; adapt the plan      | Explicit consent (`healthDataConsentAt`)            | Sessions and GPS streams, sleep, heart rate, HRV, weight and body composition, from Garmin / Strava / Withings / Apple Health | Yes    | Same as 1; raw Garmin pushes 7 days after processing |
| 4   | Athlete entries            | Same as 3                                          | Explicit consent                                    | Session feel, day journal (medication, cycle, alcohol), physical notes and conditions, food log                               | Yes    | Same as 1                                            |
| 5   | Inferences                 | Training estimates (recovery, fatigue, risk, plan) | Explicit consent                                    | Derived states and recommendations; one record per model and day (ADR-125)                                                    | Yes    | Same as 1                                            |
| 6   | AI coaching                | Briefings, analyses, coach answers                 | Separate explicit consent (`aiProcessingConsentAt`) | Athlete context sent to the model, conversation, diagnostic traces                                                            | Yes    | Same as 1; traces erased with the account (Langfuse) |
| 7   | Calendar                   | Place sessions around busy slots                   | Contract (athlete connects it)                      | Busy intervals, calendar ids (Google)                                                                                         | No     | Same as 1                                            |
| 8   | Subscription               | Grant Pro access                                   | Contract                                            | Subscription state, store transaction id (Apple)                                                                              | No     | Same as 1; **to confirm** accounting retention duty  |
| 9   | Notifications              | Morning push and reminders                         | Consent (OS permission)                             | APNs device token, preferences                                                                                                | No     | Same as 1                                            |
| 10  | Service e-mails            | Confirm account deletion                           | Contract                                            | E-mail, first name                                                                                                            | No     | Not stored by Sharpit                                |
| 11  | Errors and security        | Diagnose and protect the service                   | Legitimate interest                                 | Error reports without body metrics, rate-limit counters                                                                       | No     | **To confirm** in Sentry and Upstash settings        |

Inactive accounts: 24 months without a sign-in (Clerk `lastActiveAt`) leads to deletion, with an e-mail notice 30 days before; accounts with a renewing subscription are left alone (`packages/server/src/lib/privacy/inactive-accounts.ts`).

Strava-only activities never reach an AI model (ADR-126); aggregate load indicators computed without AI still count them.

## Recipients and processors (art. 28)

| Processor                 | Role                                 | Data                 | Location                                                                                                      | DPA signed     |
| ------------------------- | ------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| Neon                      | PostgreSQL database                  | All activities above | London, UK (adequacy decision)                                                                                | **To confirm** |
| Vercel                    | Hosting, AI gateway, cron            | All, in transit      | London, UK, the only function region (confirmed in the Vercel project settings by the controller, 2026-11-11) | **To confirm** |
| Clerk                     | Authentication                       | Activity 1           | **To confirm** (US vendor)                                                                                    | **To confirm** |
| Google, Anthropic, OpenAI | AI models through the Vercel gateway | Activity 6           | **To confirm**; no-training terms too                                                                         | **To confirm** |
| Langfuse                  | AI traces                            | Activity 6           | EU                                                                                                            | **To confirm** |
| Sentry                    | Error reports                        | Activity 11          | EU                                                                                                            | **To confirm** |
| Upstash                   | Rate limiting, cache                 | Technical ids        | **To confirm**                                                                                                | **To confirm** |
| Resend                    | Service e-mails                      | Activity 10          | **To confirm** (US vendor)                                                                                    | **To confirm** |
| Apple                     | APNs, in-app purchase, WeatherKit    | Activities 8 and 9   | Apple's terms                                                                                                 | Apple's terms  |

Garmin, Strava, Withings and Google Calendar are sources the athlete connects, each a controller of its
own. Open Food Facts receives a product name or barcode with no athlete identifier.

## Security measures (art. 32)

- Provider tokens encrypted with AES-256-GCM (`packages/server/src/lib/secret-box.ts`); never logged
  (`packages/server/src/lib/privacy/safe-log.ts`).
- Every tenant table cascades from `AthleteProfile`; deletion revokes provider grants, erases Langfuse
  traces and the Clerk identity (`packages/server/src/lib/privacy/account-deletion.ts`).
- Health sync and AI calls are gated server-side on the two consents
  (`packages/server/src/lib/privacy/consent-store.ts`).
- Database encrypted at rest by Neon; no column-level encryption of health fields. Neon point-in-time
  history: 24 hours.
- **To confirm:** who holds production access (Neon, Vercel, Clerk consoles) and whether each has MFA.

## Data subject rights

Export and deletion are self-service (privacy settings, web and iPhone). A deletion step that fails (Clerk identity, Langfuse traces, provider revocation) is e-mailed to the controller, and the daily purge keeps the profile until the outside copies are gone (ADR-127). The export lists what it
leaves out and why (`EXPORT_EXCLUDED_MODELS` in `packages/server/src/lib/privacy/export.ts`); those
items are supplied on request. Rectification is done in the app; other requests go to the contact in
the policy.
