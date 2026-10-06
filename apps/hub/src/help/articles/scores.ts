import type { HelpCategory } from '../types';

export const SCORES: HelpCategory = {
  slug: 'scores',
  title: 'Scores et mesures',
  description:
    'Récupération, sommeil, effort, fatigue, adaptation et forme : ce que chaque chiffre veut dire.',
  icon: 'scores',
  articles: [
    {
      slug: 'recuperation',
      title: 'La récupération',
      summary:
        'Un score de 0 à 100 qui synthétise quatre dimensions : ton système nerveux, ton sommeil, ton ressenti et ta charge récente.',
      body: `
Ouvre-la depuis la jauge du Résumé.

### Les quatre dimensions

| Dimension | Poids | Ce qu’elle lit |
| --- | --- | --- |
| Système nerveux | 35 % | Ta variabilité cardiaque (VFC) du matin face à ta [ligne de base](/aide/methode/ligne-de-base), modulée par ta fréquence cardiaque au repos |
| Sommeil | 30 % | La qualité de ta nuit et ta dette de sommeil |
| Ressenti | 25 % | Ton check-in du matin : humeur, énergie, courbatures, stress |
| Charge | 10 % | Ta charge récente, comme contexte |

### Quand une mesure manque

Si ta VFC n’est pas remontée, son poids est réparti entre les autres dimensions plutôt que de deviner une valeur. La confiance du verdict baisse en conséquence.

### Ce que tu lis aussi

- Ta VFC du matin, placée dans ta norme (« dans ta norme », « sous ta norme »).
- Ce qui pèse le plus sur ton score.
- Une estimation du temps avant une récupération complète.
`,
    },
    {
      slug: 'sommeil',
      title: 'Le sommeil',
      summary:
        'La durée de ta nuit face à ton besoin, sa structure, ta banque de sommeil et tes tendances sur plusieurs nuits.',
      body: `
Ouvre-le depuis la jauge du Résumé.

### Ce que tu y lis

- **Ta nuit** : durée, heure de coucher et de lever, et si elle suffit (excellente, adéquate, insuffisante ou très insuffisante).
- **Structure du sommeil** : les phases mesurées par ta montre.
- **Banque de sommeil** : la dette accumulée, ou « À l’équilibre » quand il n’y en a pas.
- **Tendances** : tes dernières nuits côte à côte.

### Tes objectifs

Règle ta durée de sommeil cible depuis la barre d’outils de l’écran Sommeil. Elle sert de référence à la banque de sommeil.

### D’où viennent les nuits

De ta montre, par Garmin ou par Apple Santé. Si les deux mesurent, ta [source principale](/aide/sources/source-principale) fait foi.
`,
    },
    {
      slug: 'effort',
      title: 'L’effort',
      summary:
        'La contrainte de ta journée sur une échelle de 0 à 21, lue face à ta capacité du moment, avec ta charge sur 7 jours et ta forme.',
      body: `
Ouvre-le depuis la **Trajectoire**, en bas de ta semaine dans le Plan.

### Ce que tu y lis

- **La contrainte du jour**, de 0 à 21, au dixième.
- **Le verdict** face à ta capacité, avec ses raisons.
- **La charge** en quatre tuiles : charge du jour, charge sur 7 jours, montée et forme. En [lecture experte](/aide/premiers-pas/lecture-essentielle-ou-experte) : TSS du jour, TSS 7 j, ACWR et TSB.
- **Ta journée hors entraînement** : pas, stress, Body Battery.
- **La composition de l’effort** et le détail des cinq dimensions de [fatigue](/aide/scores/fatigue).

### En lecture experte

Les courbes de charge et de forme (CTL, ATL, TSB) et huit semaines de charge face à leur moyenne. Voir [charge et forme](/aide/scores/charge-et-forme).
`,
    },
    {
      slug: 'fatigue',
      title: 'La fatigue',
      summary:
        'Un indice de 0 à 100 lu sur cinq dimensions. Plus il est haut, plus la fatigue pèse. Il faut au moins deux dimensions disponibles pour le calculer.',
      body: `
### Les cinq dimensions

1. **Charge** : l’accumulation mathématique de tes séances.
2. **Neuromusculaire** : ce que tes jambes et tes muscles encaissent.
3. **Métabolique** : le coût énergétique de tes séances intenses.
4. **Trajectoire cumulée** : la tendance sur plusieurs semaines.
5. **Psychologique** : ta motivation et ton stress, tirés de ton ressenti.

### Lire l’indice

| Indice | Lecture |
| --- | --- |
| 0 à 20 | Frais |
| 21 à 40 | Fatigue fonctionnelle basse |
| 41 à 60 | Fatigue fonctionnelle haute |
| 61 à 75 | Fatigue accumulée |
| 76 à 88 | Risque de surmenage non fonctionnel |
| 89 à 100 | Risque de surentraînement |

La fatigue est l’une des cinq lectures du [verdict du jour](/aide/methode/verdict-du-jour), juste après l’état physique. Elle est lue sur ses cinq dimensions après environ cinq semaines d’historique.
`,
    },
    {
      slug: 'adaptation',
      title: 'L’adaptation',
      summary:
        'Un indice de 0 à 100 qui dit si ton entraînement produit des progrès, se maintient ou plafonne, et la charge conseillée pour le bloc suivant.',
      body: `
Ouvre-la depuis la **Trajectoire**, en bas de ta semaine dans le Plan.

### Les quatre dimensions

| Dimension | Poids |
| --- | --- |
| Progression de la charge | 30 % |
| Efficacité neuromusculaire | 25 % |
| Adaptation autonome | 25 % |
| Qualité de la récupération | 20 % |

Une dimension absente voit son poids réparti sur les autres. Si moins de la moitié des poids est disponible, l’indice n’est pas calculé.

### Ce que tu y lis

- **L’indice** et son statut, de « en adaptation » à « désentraînement ».
- **La tendance** sur tes dernières lectures.
- **Les signaux** « Plateau » et « Surcharge sans gain ».
- **Le frein** : la dimension qui limite le plus, en tête de liste.
- **La charge du prochain bloc** : « Neutre », ou un multiplicateur comme « ×0,90 ».
`,
    },
    {
      slug: 'charge-et-forme',
      title: 'Charge d’entraînement et forme',
      summary:
        'Chaque séance a une charge. Leur cumul donne ta forme de fond sur 42 jours, ta fatigue récente sur 7 jours, et l’écart entre les deux.',
      body: `
### La charge d’une séance

Elle combine durée et intensité, quel que soit le sport. Elle s’affiche « charge 78 » en lecture essentielle, « 78 TSS » en lecture experte.

### Les trois courbes (lecture experte)

| Courbe | Constante | Ce qu’elle représente |
| --- | --- | --- |
| CTL | 42 jours | Ta forme de fond, construite lentement |
| ATL | 7 jours | Ta fatigue récente |
| TSB | CTL moins ATL | Ta fraîcheur : négative en bloc de charge, positive avant une course |

### L’ACWR

Le rapport entre ta charge des 7 derniers jours et ta charge habituelle. Une montée trop rapide est signalée dans l’[effort](/aide/scores/effort) et pèse sur les [garde-fous](/aide/plan/garde-fous) du plan.
`,
    },
  ],
};
