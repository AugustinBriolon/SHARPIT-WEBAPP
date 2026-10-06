import type { HelpCategory } from '../types';

export const METHODE: HelpCategory = {
  slug: 'methode',
  title: 'La méthode',
  description:
    'Comment SharpIt passe de tes mesures à une décision, et ce qu’il fait quand il doute.',
  icon: 'method',
  articles: [
    {
      slug: 'les-cinq-temps',
      title: 'Les cinq temps, du capteur à ta séance',
      summary:
        'Observer, comparer, arbitrer, programmer, réparer. Chaque matin, SharpIt refait ce chemin dans cet ordre.',
      body: `
### 1. Observer

Séances, charge, mesures du matin, agenda : chaque donnée entre avec sa source et son heure, et n’est jamais réécrite. Quand deux appareils mesurent la même chose, tu choisis lequel fait foi (voir [la source principale](/aide/sources/source-principale)).

### 2. Comparer

Tes mesures du matin sont lues contre [ta propre ligne de base](/aide/methode/ligne-de-base), pas contre une moyenne de population.

### 3. Arbitrer

Cinq lectures indépendantes sont arbitrées en [une seule décision](/aide/methode/verdict-du-jour). En cas de conflit, la prudence l’emporte.

### 4. Programmer

Le coach propose tes séances selon ton objectif, tes jours libres et ton matériel. Chaque proposition passe [treize contrôles](/aide/plan/garde-fous) avant de t’être montrée.

### 5. Réparer

Ta forme baisse, une séance saute : SharpIt propose d’ajuster. Tu acceptes, tu ajustes ou tu gardes ton plan. Rien ne change sans ton accord.
`,
    },
    {
      slug: 'ligne-de-base',
      title: 'Ta ligne de base personnelle',
      summary:
        'Tes mesures du matin sont comparées à tes quatorze derniers jours. Un écart de moins de 5 % est traité comme du bruit, pas comme une alerte.',
      body: `
Une variabilité cardiaque de 45 ms ne dit rien seule : elle est haute pour certains, basse pour d’autres. SharpIt la lit donc contre **ta** normale.

### Comment elle se calcule

- **Fenêtre glissante de 14 jours** : chaque matin, la ligne de base avance d’un jour.
- **Zone de bruit de ±5 %** : un écart plus petit est considéré comme une variation normale d’un jour à l’autre.
- Au-delà, l’écart est lu, pondéré et porté jusqu’au verdict.

### Quand elle devient fiable

Elle est exploitable après **7 jours** de mesures et mûre après **28 jours**. Avant, SharpIt te dit que ses lectures sont fragiles (voir [le niveau de confiance](/aide/methode/niveau-de-confiance)).
`,
    },
    {
      slug: 'verdict-du-jour',
      title: 'Comment le verdict du jour est décidé',
      summary:
        'Cinq lectures sont arbitrées en une décision, avec trois raisons au plus. À situation égale, décision égale : l’arbitrage est déterministe.',
      body: `
### Les cinq lectures

État physique, fatigue, forme du jour, conditions extérieures et progression sont lues chacune de leur côté.

### L’ordre de priorité

Quand elles ne disent pas la même chose, la plus prudente l’emporte, dans cet ordre :

1. État physique
2. Fatigue
3. Forme du jour
4. Conditions
5. Progression

Une progression qui dit « pousser » ne passe jamais devant une fatigue qui dit « prudence ».

### Ce que tu lis le matin

- **Le verdict** : la posture du jour (protéger, tenir ou pousser), ou incertain quand les données manquent.
- **Le facteur limitant** : la lecture qui a décidé.
- **Les preuves**, rangées par importance, trois au plus.
- **Le niveau de confiance** (voir [cet article](/aide/methode/niveau-de-confiance)).

### Déterministe

La décision n’est pas prise par un modèle de langage : elle sort de règles fixes. Deux matins identiques donnent la même décision.
`,
    },
    {
      slug: 'niveau-de-confiance',
      title: 'Le niveau de confiance',
      summary:
        'Chaque verdict porte une confiance de 0 à 1. Quand les données manquent, SharpIt retient son conseil plutôt que de fabriquer une certitude.',
      body: `
| Confiance | Seuil | Ce que fait SharpIt |
| --- | --- | --- |
| Élevée | 0,75 et plus | Conseil complet |
| Moyenne | 0,60 et plus | Conseil, avec prudence |
| Faible | Au-dessus de 0 | Conseil signalé comme fragile |
| Insuffisante | 0 | Pas de conseil |

### Ce qui fait baisser la confiance

Une mesure du matin absente, une ligne de base encore jeune, une montre non synchronisée, des lectures qui se contredisent.

### Comment la faire monter

Porte ta montre la nuit, laisse la synchronisation se faire, et fais ton check-in du matin : ton ressenti compte dans la [récupération](/aide/scores/recuperation).
`,
    },
    {
      slug: 'ce-que-ton-modele-apprend',
      title: 'Ce que ton modèle apprend avec le temps',
      summary:
        'Ta ligne de base est exploitable à 7 jours et mûre à 28. La fatigue est lue sur ses cinq dimensions à 5 semaines, et le modèle se calibre sur tes réponses à 90 jours.',
      body: `
| Après | Ce qui devient possible |
| --- | --- |
| 7 jours | Ta ligne de base devient exploitable |
| 28 jours | Elle est mûre, tes habitudes apparaissent |
| 5 semaines | La [fatigue](/aide/scores/fatigue) est lue sur ses cinq dimensions |
| 90 jours | Le modèle se calibre sur tes réponses |

### Ton historique accélère tout

À la première connexion de Garmin, ton historique complet est importé : la lecture de ta charge n’attend pas cinq semaines. Avec Apple Santé, l’app envoie ta dernière année.
`,
    },
    {
      slug: 'memoire-des-decisions',
      title: 'La mémoire des décisions',
      summary:
        'Chaque conseil est gardé avec ce que tu as choisi et ce qui a suivi. Ton modèle ne repart pas de zéro chaque lundi, ni quand tu changes de montre.',
      body: `
Un exemple de ce que SharpIt garde :

1. **Conseillé** : alléger la séance de seuil.
2. **Choisi** : plan gardé.
3. **Ce qui a suivi** : fatigue en hausse sur trois jours.

Cette trace sert à lire tes réponses à l’entraînement au fil des semaines. Elle appartient à ton compte, pas à ton appareil : changer de montre ne l’efface pas.
`,
    },
  ],
};
