# ADR-096: Server copy follows the athlete's language

**Status:** Accepted
**Date:** 2026-10-19
**Author:** Augustin Briolon

---

## Context

The iOS app ships worldwide in French and English (SHARPIT-APP ADR 0019). Much of what the athlete
reads is written by the server: verdict tags and lines, readouts and labels in every `/api/v1`
payload, error messages, pushes, pro perks, and every coach answer. All of it was French, spread
over ~300 modules (`packages/server`, and `packages/app` modules the server imports), much of it in
module-level tables (`VERDICT_TAG`, `LIMITER_LABEL_BY_DENSITY`, `pro-perks`…) evaluated once at
import. The web stays French and must not change. Counted: ~2,600 distinct French strings that can
reach the app, plus the LLM prompts, which are French.

## Decision

1. **The language is stored and sent.** `AthleteProfile.locale` (`fr` | `en`, nullable; migration
   `20261019120000_athlete_locale`, PATCHable through `/api/v1/athlete-profile`). The app PATCHes the
   language it shows on each launch; `@sharpit/shared/locale` parses and resolves it.
2. **One request, one language.** `inAppLocale` wraps every `/api/v1` route and `/api/coach/chat`
   (the app's one non-v1 call). For a Bearer request (the app) it resolves Accept-Language (the
   language of the screen asking), else the stored locale, else English; anything else (the web)
   is French. The locale lives in an `AsyncLocalStorage` (`currentLocale()`), so code deep in the
   stack reads it without every signature carrying it. Background work for one athlete — the sync
   and morning-push crons, plan horizon, `refreshAthleteState` / `onProviderSyncCompleted` from
   webhooks — runs in `inAthleteLocale(athleteId)`, the stored language.
3. **Deterministic copy is translated where it leaves the server.** The code keeps writing French.
   For an English request, `inAppLocale` passes the JSON body through `englishDeep`, and
   `sendPushToDevices` does the same for push payloads. `translate-copy.ts` looks every string up
   in `copy-en.json`, keyed by the French text (the iOS catalog's convention): exact strings first,
   then templates whose `{0}`/`{name}` slots match short parts (≤ 40 chars, no sentence inside),
   then the string's « · »-separated parts and sentences one by one, then French date words next to
   a day number. `copy-en.json` is the extracted server copy translated, layered over the iOS
   catalog's own pairs.
4. **Generated copy is asked for in the language.** `inAnswerLanguage(system)` appends an
   English-output directive to the French system prompts of every LLM call (coach chat, analyses,
   narrative, briefing, weekly review, nutrition, meal description) when `currentLocale()` is `en`;
   the weekly review is also given its English headings, which the app sorts by.
5. **Pushes written explicitly.** `session-alerts.ts` and `athlete-notifications.ts` word pushes per
   locale (English word order differs: « ton vélo endurance » / “your endurance ride”).

## Options considered

### Option A — Translate at the boundary, French keys (chosen)

Pros: no change to the ~300 modules or their module-level tables; the web is untouched by
construction; one dictionary to grow. Cons: a string matching no key stays French (new copy needs
its English added); exact matching may translate an athlete's own text that equals a key (a session
titled « Repos » reads “Rest”); generic templates need guarding (the slot bounds above).

### Option B — `tr()` at every call site

Pros: explicit and exact. Cons: thousands of edits; every module-level table becomes a function
(evaluated per request); `packages/app` modules cannot read the request's locale without passing it
through every signature, or pulling `node:async_hooks` into web bundles.

### Option C — An i18n library with message ids (next-intl, i18next)

Pros: plurals and ICU formats. Cons: the same call-site rewrite as B plus ids for 2,600 strings, for
a product with two languages and a French web.

### Option D — Translate prompts to English and let the LLM write everything

Pros: no dictionary. Cons: deterministic copy is not LLM-written, and a model call per response is
neither instant nor free.

## Consequences

### Positive

- The app reads in English end to end: payload copy, errors, pushes, coach answers.
- The web is unchanged: no locale is set for it, nothing is translated.
- Adding a language later is a new dictionary and a directive, not a rewrite.

### Negative

- New French copy that reaches the app needs its English in `copy-en.json`, or it shows in French.
  The extraction script and the coverage pass over the app's fixtures are the check.
- Stored generated text (weekly reviews, briefings, narratives) keeps the language it was written in:
  switching language does not rewrite the past.
- Numbers formatted French-style on the server (decimal comma) stay so in English.
- One extra profile read per app request whose Accept-Language names neither French nor English.

### Neutral

- `hasBearer` now takes any `Request`.
- Prod: the migration is applied by hand, like the others.

## References

- SHARPIT-APP ADR 0019 — the app's String Catalog and language picker
- `packages/server/src/lib/locale/` — `locale-context.ts`, `translate-copy.ts`, `copy-en.json`
