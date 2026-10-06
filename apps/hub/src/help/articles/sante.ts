import type { HelpCategory } from '../types';

export const SANTE: HelpCategory = {
  slug: 'sante',
  title: 'Santé et journal',
  description:
    'Ton bilan, ton âge biologique, tes zones sensibles, ton journal et ton check-in du matin.',
  icon: 'health',
  articles: [
    {
      slug: 'bilan-sante',
      title: 'Le bilan Santé',
      summary:
        'L’onglet Santé range tes mesures par ce qui compte : chaque marqueur lu face à une norme publiée et face à ton propre mois.',
      body: `
### Dans l’ordre

1. **L’en-tête** : ton [âge biologique](/aide/sante/age-biologique), ou le nombre de marqueurs dans leur norme, puis ceux qui ont bougé.
2. **À surveiller**, seulement quand quelque chose le mérite : fréquence cardiaque au repos en hausse plusieurs jours, VFC sous ta plage, nuits courtes, poids qui change vite.
3. **Zones sensibles** (voir [cet article](/aide/sante/zones-sensibles)).
4. **Signes vitaux** : fréquence cardiaque au repos, VFC, sommeil, VO₂max.
5. **Corps** : poids et sa cible, masse grasse, graisse viscérale, muscle.
6. **Au quotidien** : pas, respiration pendant le sommeil.

### Un marqueur

Touche-le pour sa lecture, sa source et sa courbe : glisse le doigt pour lire chaque mesure.

Le bilan est gratuit, sauf l’âge biologique. Ce n’est pas un avis médical.
`,
    },
    {
      slug: 'age-biologique',
      title: 'L’âge biologique',
      summary:
        'L’âge auquel ta VO₂max serait la moyenne de la population. Une estimation d’entraînement, pas un diagnostic. Réservé à SharpIt Pro.',
      body: `
### La méthode

SharpIt compare ta VO₂max (course, sinon vélo) aux valeurs moyennes par sexe et par décennie d’une étude de référence sur 3 816 adultes en bonne santé (HUNT3, Loe et al., PLoS ONE, 2013). Ton âge biologique est l’âge auquel cette moyenne égale ta VO₂max, entre 20 et 80 ans.

### Ce qu’il lui faut

- Ta date de naissance et ton sexe, renseignés dans ton compte.
- Une VO₂max mesurée par ta montre.

Sans VO₂max, il n’est pas calculé, et l’écran te dit ce qui manque.

### Ce qu’il n’est pas

Une estimation de ta forme d’endurance, jamais un âge médical. Les âges estimés par une balance connectée sont montrés à part, sous leur propre nom.
`,
    },
    {
      slug: 'zones-sensibles',
      title: 'Les zones sensibles',
      summary:
        'Une douleur ou une blessure déclarée devient une zone que le plan sait protéger, avec une stratégie, un suivi de 0 à 10 et une fin.',
      body: `
### Déclarer une zone

Depuis **Santé › Zones sensibles**, choisis la partie du corps dans la liste, pour que le plan puisse la reconnaître, et décris ce que tu ressens.

### Ce que fait le plan

Chaque zone suit une stratégie : **à protéger**, **en reprise** ou **à corriger**. Sa page montre ce que le plan en fait et les séances à venir qui la sollicitent. Le [garde-fou](/aide/plan/garde-fous) « Ne charge pas une zone à protéger » s’applique à chaque proposition.

### Faire le point

**Faire le point** note l’intensité de 0 à 10, ce que tu as pu faire et un mot. Une zone peut passer **sous surveillance** puis **résolue** : SharpIt le propose après deux semaines de points à 0 sur 10, jamais automatiquement. Si ça revient, **Ça revient** la rouvre.
`,
    },
    {
      slug: 'check-in-du-matin',
      title: 'Le check-in du matin',
      summary:
        'Quelques questions sur ton humeur, ton énergie, tes courbatures et ton stress. Ton ressenti pèse un quart du score de récupération.',
      body: `
### Pourquoi le faire

Une montre mesure ton corps, pas ce que tu ressens. Le ressenti compte pour 25 % de ta [récupération](/aide/scores/recuperation), et il affine la [proposition du matin](/aide/plan/proposition-du-matin).

### Où le faire

Depuis le Résumé, quand il est proposé, ou depuis la carte de proposition du matin. Il se ferme dès que tu as répondu.
`,
    },
    {
      slug: 'journal',
      title: 'Le journal',
      summary:
        'Note ta journée : humeur, habitudes, signaux du soir et de la nuit. Tu choisis ce que tu suis, et une checklist automatique se remplit depuis tes données.',
      body: `
### Choisir ce que tu suis

Le réglage du journal liste les signaux disponibles, rangés par catégorie. Active ceux qui t’intéressent : café, hydratation, conduite, régimes alimentaires…

### Comment il est rangé

Par moment de la journée : **Journée**, **Checklist auto**, **Nuit dernière** et **Signaux du jour**.

### La checklist automatique

Ses lignes se cochent seules depuis tes données (séances, pas, sommeil). Elles ne se modifient pas à la main.

### Les jours notés

Dans le sélecteur de jours, un point marque un jour où quelque chose a été noté.
`,
    },
    {
      slug: 'analyses-du-journal',
      title: 'Les analyses du journal',
      summary:
        'Ce que tes habitudes accompagnent : sommeil, récupération, Body Battery. Elles s’ouvrent après sept jours notés. Une association n’est pas une cause.',
      body: `
Ouvre-les depuis la barre d’outils du journal, **Analyses**.

### Ce que tu y lis

- **Ce qui t’aide**, **Ce qui te freine** et **Pistes à confirmer**.
- Une carte par résultat (Sommeil, Récupération, Body Battery), chaque habitude comparée entre les jours avec et les jours sans.

### Avant sept jours

L’écran montre ta progression jusqu’à sept jours notés : avant, une association serait du hasard.

Une habitude qui va avec un meilleur sommeil ne le cause pas forcément. Les lectures faibles sont signalées comme telles.
`,
    },
  ],
};
