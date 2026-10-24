## SharpIt Privacy Policy

**Last updated:** 24 October 2026

This is the English version of the [French privacy policy](/privacy). The French version is the reference text.

### 1. Who is the data controller?

The controller of the personal data collected through SharpIt is:

**Augustin Briolon** (natural person, publisher of SharpIt)  
Postal address: provided on request at the address below  
Privacy contact: [augustin.briolon@gmail.com](mailto:augustin.briolon@gmail.com)

### 2. What is SharpIt?

SharpIt is a training-support tool (wellness / coaching), available on the web and as an iPhone app. During the **beta**, access is meant for a **small circle** of athletes. SharpIt is **not** a medical device and does not replace medical advice.

### 3. What data do we process?

Depending on your use and the connectors you enable, SharpIt may process:

| Category                | Examples                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account                 | Identifiers and account data managed through **Clerk** (e-mail, first and last name, technical id)                                                                                      |
| Athletic profile        | Height, date of birth, sex, thresholds (FTP, max heart rate, paces), sports, equipment, goals                                                                                           |
| Apple Health (iPhone)   | Only if you enable it: workouts and GPS tracks, sleep, heart rate, HRV, resting heart rate, steps, weight. Read on the iPhone and sent to SharpIt; never used for advertising or resold |
| Connected services      | Depending on what you connect (**Garmin**, **Withings**, **Google Calendar**): activity, recovery, body composition, calendar slots                                                     |
| Athlete input           | Perceived effort and feeling for sessions, the daily journal (including health answers), physical notes, messages to the coach                                                          |
| Food log                | Meals, foods, portions and goals you enter                                                                                                                                              |
| Camera, location, voice | Only when you use the barcode scanner, allow weather by location (about 1 km, sent to Apple Weather, not to SharpIt), or dictate a question to the coach                                |
| Subscription            | In-app purchases handled by **Apple**: SharpIt receives the subscription status and a transaction id, never your payment details                                                        |
| Notifications           | Apple device token (APNs) and your notification preferences                                                                                                                             |
| Inferences              | Training estimates derived from your data (recovery, fatigue, risks) — **estimates**, not a diagnosis                                                                                   |
| Technical data          | Limited technical logs and crash reports — no plain-text passwords or tokens, and no body metrics in application logs                                                                   |

Some of this data (physiological data and the inferences drawn from it) is treated as **health data** under **Article 9 of the GDPR**.

### 4. Purposes

Data is processed only to:

- provide SharpIt's coaching and training support;
- synchronise and interpret the observations you choose to connect;
- operate and secure the service;
- answer your requests (export, deletion, privacy questions).

We do not sell your data. No advertising, no tracking across apps or sites. We do not train general-purpose AI models on your data. **Data from Garmin, and anything derived from it, is never used to train, evaluate or improve an AI model.**

### 5. Legal bases

| Processing                                                | Basis                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Account, running the service, security                    | Performance of the contract; legitimate interest for technical security                      |
| Acceptance of the terms and this policy                   | Consent / contractual acceptance at sign-up                                                  |
| Synchronising and processing health data (Art. 9)         | **Explicit consent**, required before any synchronisation or processing of this data         |
| Sending athlete context to an AI model (coach, briefings) | **Separate consent** for AI processing — a hard gate: without it, these AI paths are blocked |

You can withdraw a consent at any time (this may limit or stop the feature concerned). Contact: [augustin.briolon@gmail.com](mailto:augustin.briolon@gmail.com).

### 6. Garmin

SharpIt reads your Garmin data through the **official Garmin Connect API**, with your agreement and on your behalf only.

- **Data read:** activities (sessions, duration, distance, heart rate, power, tracks), sleep, HRV, resting heart rate, stress, Body Battery, steps, weight. Nothing else: SharpIt does not read women's health data.
- **Purposes:** compute your training load, recovery and sleep; adapt your plan; feed the AI coach (only with your AI consent); and, for Pro subscribers, send your planned workouts to your watch.
- **Connection:** during the beta, a **personal API key** that you create on Garmin Connect. It is checked with Garmin, **encrypted** (AES-256-GCM), never shown again (only its last four characters are) and never logged. You can revoke it at any time on Garmin Connect.
- **No sale.** Your Garmin data is not sold, rented or shared with third parties, other than the technical processors listed in section 8. It is not used to train, evaluate or improve an AI model.
- **Control:** **Settings → Data sources → Garmin → Disconnect** in the iPhone app erases the key from our servers and stops all reads. Data already imported is kept until you delete it with your account (section 9). You can also export it, correct it (your profile and sessions) or have it deleted (section 10).
- **Withdrawal:** withdrawing your health-data or AI consent (Privacy & terms) stops Garmin synchronisation or the AI uses concerned.

**Non-official integrations.** If a connection to a third-party service is not provided or approved by its publisher, it is flagged as **unofficial**, offered "as is", may stop working, and involves a data transfer to / from that third party under its own terms. Your credentials are then encrypted and an acknowledgement is required before connecting. Today, no offered connection is in that case.

### 7. Artificial intelligence (hard gate)

When you consent to AI processing:

- SharpIt may send the **necessary context** (state, relevant training history, including data from Garmin) to an AI model provider, through the **Vercel** AI gateway, to generate briefings, analyses or coaching answers. The models are provided by **Google** (Gemini), **Anthropic** (Claude) and **OpenAI** (GPT), depending on the model available;
- these providers process the context only to answer the request;
- exchanges with the model are logged at **Langfuse** (EU hosting) for **technical diagnosis only**, and erased with your account; they are not used to evaluate or improve AI models;
- this consent is **separate** from the health-data consent;
- **without** AI consent, nothing is sent to a model;
- SharpIt does not use your data to **train a general-purpose model**;
- **withdrawal in one gesture:** Privacy & terms → AI processing (iPhone), or Account → Data and privacy (web). From then on, no context is sent to any model.

**AI transparency.** The coach, the written weeks and the reviews are generated by AI models from your data. They are **training estimates** that may contain errors: they are neither medical advice nor a diagnosis, and you decide whether to follow them.

### 8. Recipients and processors

Depending on the service configuration, technical providers may process data on our behalf, notably:

- **Clerk** — authentication and account;
- **Vercel** — hosting / execution of the application, AI gateway;
- **Neon** — hosted PostgreSQL database;
- **Upstash** — rate limiting / operational cache;
- **Sentry** (EU hosting) — crash and error reports, without body metrics;
- **Apple** — notifications (APNs), in-app purchases, weather (WeatherKit), Apple Health on your iPhone;
- **Open Food Facts** — open food database: SharpIt looks a product up by name or barcode from its servers, without sending who you are;
- **Google, Anthropic, OpenAI** (AI models, through Vercel's gateway) and **Langfuse** — only if you consented to AI processing;
- **Garmin** — source of the data you choose to connect, through the official Garmin Connect API.

The services **you** connect (Garmin, Withings, Google Calendar) receive or expose data under **their** policies and the scope you authorise.

Some providers may process data outside the European Union; these transfers are covered by the safeguards provided by the GDPR (standard contractual clauses or an adequacy decision).

### 9. Retention

- Active account: data is kept as long as the account is needed for the service.
- **Deletion:** on your request, the account is **deactivated immediately** and disconnected from your sources (the Garmin key is erased), then the account, the sign-in identifier and the associated data are **permanently deleted after 14 days** (a recovery window in case of error).
- Technical logs and crash reports: kept only as long as needed for operation and security.
- On the iPhone, a local cache (latest data read) stays on the device; it is erased when another account signs in and when the account is deleted. It is not copied to iCloud.

### 10. Your rights

Under the GDPR you have the rights of access, rectification, erasure, restriction, objection, portability, and the right to withdraw your consent.

- Exercising your rights / questions: [augustin.briolon@gmail.com](mailto:augustin.briolon@gmail.com)
- Export: a JSON export of the personal data SharpIt holds about you, from Settings → Privacy on the web.
- Deletion: from Settings → Privacy, on the web and on the iPhone.
- Complaint: you may contact the **CNIL** ([www.cnil.fr](https://www.cnil.fr)).

### 11. Health notice (wellness)

SharpIt is a training-support tool. It is not a medical device and does not replace medical advice. The signals (recovery, fatigue, risks) are training estimates, not a diagnosis.

### 12. Changes

This policy may change. In case of a material change, the accepted version of this policy may be updated and a new acceptance requested.

### 13. Contact

**Augustin Briolon** — [augustin.briolon@gmail.com](mailto:augustin.briolon@gmail.com)
