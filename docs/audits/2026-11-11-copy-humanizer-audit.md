# Audit Humanizer — copy athlète (2026-11-11)

Critères : [blader/humanizer](https://github.com/blader/humanizer) §A–C. Tirets = liaison de propositions seulement. Hors scope : commentaires code, placeholders `— kg`, plages numériques, marketing hub/emails.

## Déjà couvert

| Surface                                                               | Statut                                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sorties LLM (coach, analyses, briefing, weekly, narrative, nutrition) | Tirets nettoyés par `sanitizeCoachCopy` + `COACH_COPY_DASH_RULE` dans les prompts |
| Landing                                                               | Test « no em dash » déjà vert                                                     |
| Verdict glossary (`verdict-copy.ts`)                                  | Aucun `—` dans les strings athlète (seulement commentaires)                       |

## Hits passe 1

### Push — tiret + closer (§2 / §8)

| Fichier                                                           | Hit                                  | Pattern              | Rewrite                              |
| ----------------------------------------------------------------- | ------------------------------------ | -------------------- | ------------------------------------ |
| `packages/server/src/lib/push/session-alerts.ts` FR `shortOfPlan` | `…c’est fait — c’est ce qui compte.` | §8 tiret + §2 closer | `Pas tout le plan, mais c’est fait.` |
| idem EN                                                           | `…done — that’s what counts.`        | §8 + §2              | `Not the whole plan, but it’s done.` |

### Localizable iOS — ~42 clés phrase-like avec `—` (hors `— kg` / clé `"—"` / copyright Gym visual / plages)

Exemples typiques : `Blessé — priorité…`, `Calibration en cours — …`, `Très dur — signes…`, `%@ connecté — synchronisation…`. Rewrite → point / virgule / deux phrases. Call sites `String(localized:)` à aligner.

### Prompts LLM — style incomplet

| Fichier                                       | Hit          | Pattern                                                   | Rewrite                                                       |
| --------------------------------------------- | ------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| Tous les injecteurs de `COACH_COPY_DASH_RULE` | Tirets seuls | Manque §1 staging, §2 closers, §6 triades, §12 mots stock | Ajouter `COACH_COPY_STYLE_RULE` (dash + anti-tells condensés) |

### Hors passe 1 (noté, non réécrit)

- Commentaires développeur avec `—` dans le code Swift/TS
- Placeholders UI `—`, `— kg`, `— mg`, `— ml`, `— min`, `— g`
- Contenu historique en DB (briefings déjà stockés)
- Attribution `© Gym visual — gymvisual.com`

## Fait dans cette passe

- `COACH_COPY_STYLE_RULE` (= dash + humanizer) injecté dans les prompts athlete-facing
- Push `shortOfPlan` FR/EN sans closer ; weekly-review body « Le bilan et la suite sont prêts. »
- 42 clés Localizable + call sites Swift sans tiret de liaison
