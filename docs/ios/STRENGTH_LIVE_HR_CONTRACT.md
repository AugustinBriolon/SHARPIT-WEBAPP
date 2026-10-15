# iOS — séance force avec FC live

Contrat additif pour `POST /api/v1/strength-sessions`.  
N’altère pas `POST /api/v1/health-workouts` ni les imports Garmin/Strava.

Auth : Bearer Clerk (comme les autres routes `/api/v1`).  
Consentement santé requis (`CONSENT_REQUIRED` sinon).

## Payload

```json
{
  "clientSessionId": "uuid-stable-par-seance",
  "start": "2026-10-15T10:00:00+02:00",
  "durationSec": 3600,
  "title": "Renfo A",
  "strengthSets": [
    {
      "exercise": "Squat",
      "sets": 3,
      "reps": 8,
      "weightKg": 60,
      "rpe": 7,
      "restSec": 90,
      "order": 0
    }
  ],
  "avgHr": 128,
  "maxHr": 156,
  "hrSamples": [{ "t": 0, "bpm": 110, "source": "ble" }]
}
```

| Champ                 | Règle                                               |
| --------------------- | --------------------------------------------------- |
| `clientSessionId`     | 1…64 chars, stable — idempotence des retries        |
| `start`               | ISO-8601 avec offset (`datetime` Zod)               |
| `durationSec`         | entier 1…14 400 (4 h)                               |
| `strengthSets`        | même schéma que la création d’activité web (max 50) |
| `avgHr` / `maxHr`     | entiers 25…250 — **revérifiés serveur**             |
| `hrSamples[].t`       | entier 0…`durationSec`                              |
| `hrSamples[].bpm`     | entier 25…250                                       |
| `hrSamples[].source`  | `'watch'` \| `'ble'` uniquement                     |
| Nombre d’échantillons | ≤ `min(⌊durationSec/5⌋ + 24, 3000)`                 |

Échantillonnage attendu ≈ toutes les 5 s. Les trous (pas de point) restent des gaps côté serveur — **pas d’interpolation**.

## Avg / max

Le serveur recalcule avg (arrondi) et max à partir des samples.  
Si `|client − serveur| > 2 bpm` → rejet (`AVG_HR_INCONSISTENT` / `MAX_HR_INCONSISTENT`).  
Les valeurs stockées et poussées au Coach sont **toujours** celles du serveur.

## Zones FC

Calculées à la lecture du stream à partir du profil athlète (`lthr` / `maxHr`), comme une activité montre.

## Dédup / merge

Si une activité montre (Garmin/Strava/Apple) chevauche la même fenêtre (empreinte type + début + durée) :

1. **Une seule** activité
2. Les **exercices / sets de l’app** gagnent
3. La série FC la plus **couvrante** gagne (coverage temporelle)
4. Même logique quel que soit l’ordre d’arrivée
5. Retry avec le même `clientSessionId` → `outcome: "unchanged"` (idempotent)

Source stockée : `sharpit-ios` (éventuellement composé, ex. `garmin+sharpit-ios`).

## Réponses

Succès `200` :

```json
{
  "apiVersion": 1,
  "activityId": "…",
  "outcome": "created" | "merged" | "unchanged",
  "hasHr": true,
  "liveHrSource": "watch" | "ble"
}
```

Erreur `400` / `403` / `429` / `500` — **codes seuls**, jamais de bpm :

| Code                    | Quand                     |
| ----------------------- | ------------------------- |
| `INVALID_PAYLOAD`       | corps / schéma Zod        |
| `INVALID_BPM`           | bpm hors 25…250           |
| `INVALID_SAMPLE_TIME`   | `t` hors 0…durationSec    |
| `INVALID_SAMPLE_SOURCE` | source hors enum          |
| `TOO_MANY_SAMPLES`      | au-delà du plafond        |
| `EMPTY_HR_SAMPLES`      | tableau vide              |
| `AVG_HR_INCONSISTENT`   | avg client ≠ serveur (±2) |
| `MAX_HR_INCONSISTENT`   | max client ≠ serveur (±2) |
| `CONSENT_REQUIRED`      | pas de consentement santé |
| `RATE_LIMITED`          | quota                     |
| `INTERNAL_ERROR`        | 500                       |

## Confidentialité

- Aucune valeur FC dans les logs (booléens / codes / compteurs uniquement)
- Aucune FC dans les payloads push
- Données de démo uniquement dans tests / docs / captures

## UI web

Détail séance : courbe FC avec gaps visibles, avg / max / zones ; libellé **« FC captée en direct »** si `liveHrSource === "ble"`.
