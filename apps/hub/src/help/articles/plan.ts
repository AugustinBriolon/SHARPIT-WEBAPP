import type { HelpCategory } from '../types';

export const PLAN: HelpCategory = {
  slug: 'plan',
  title: 'Plan et séances',
  description: 'Ta semaine, tes séances clés, les garde-fous, et comment le plan se répare.',
  icon: 'plan',
  articles: [
    {
      slug: 'remplir-ta-semaine',
      title: 'Faire préparer ta semaine par le coach',
      summary:
        'Dans le Plan, « Remplir ma semaine » demande au coach une semaine vers ton objectif. Il la prépare en arrière-plan et te prévient quand elle est prête.',
      body: `
### Comment faire

1. Ouvre le **Plan** et touche **Remplir ma semaine**.
2. Le coach lit ton état, ton objectif, tes jours libres et ton matériel, et rédige les séances une à une.
3. Tu peux quitter l’app : une notification « Ta semaine est prête » te ramène au résultat.
4. Relis chaque séance, retire celles que tu ne veux pas, puis touche **Ajouter**.

### Ce que tu vois avant d’ajouter

Chaque séance proposée s’ouvre sur son déroulé et une phrase qui dit pourquoi le coach l’a placée là. Les [séances clés](/aide/plan/seances-cles) sont marquées.

### Ce qui a déjà été vérifié

Les [garde-fous](/aide/plan/garde-fous) passent avant que tu voies la semaine : ce qu’ils refusent est retiré avant l’affichage.

Il faut le [consentement IA](/aide/confidentialite/consentements) pour que le coach rédige des séances.
`,
    },
    {
      slug: 'seances-cles',
      title: 'Les séances clés',
      summary:
        'Deux ou trois séances par semaine sont marquées « Clé » : la course, les séances dures, la sortie longue, un enchaînement. Les autres sont du bonus.',
      body: `
### Pourquoi les distinguer

Toutes les séances ne se valent pas. Rater une séance facile n’a presque pas d’effet ; rater une séance clé, si. SharpIt concentre donc son attention sur elles.

### Où tu les vois

Le badge **Clé** apparaît dans le Plan, dans le Résumé et sur les propositions du coach. Dans le détail d’une séance, **Séance clé** se coche ou se décoche à la main.

### Ce que ça change

- « Dommage pour hier » ne parle que d’une séance clé manquée.
- Une semaine sans aucune séance marquée compte toutes ses séances comme clés.
`,
    },
    {
      slug: 'garde-fous',
      title: 'Les treize garde-fous du plan',
      summary:
        'Le coach rédige, des règles fixes vérifient. Chaque séance proposée passe treize contrôles avant d’arriver dans ton plan.',
      body: `
Une proposition n’est jamais modifiée en silence : elle passe, elle est signalée, elle attend ta confirmation, ou elle est retirée.

### Les treize contrôles

1. Compatible avec le verdict du jour
2. Respecte ton état physique
3. Ne charge pas une zone à protéger
4. Charge de la semaine tenable
5. Deux à trois séances intenses par semaine, pas plus
6. Séances intenses espacées de 24 h
7. Rien après la date de ta course
8. Pas de conflit avec ton agenda
9. Une séance faite n’est jamais réécrite
10. Seulement les sports que tu pratiques
11. Séances de renforcement complètes
12. Sans seuils connus, il demande ta confirmation
13. Ni doublon, ni séance mal formée

Ces contrôles s’appliquent à la semaine préparée par le coach, aux ajustements et aux changements proposés dans la conversation.
`,
    },
    {
      slug: 'proposition-du-matin',
      title: 'La proposition du matin',
      summary:
        'Dès que ta nuit est lue, SharpIt peut proposer d’alléger ou d’augmenter la séance du jour. Tu choisis : alléger, augmenter, ou garder le plan.',
      body: `
### Quand elle apparaît

Sous le verdict, dans le Résumé, quand ta nuit et tes mesures du matin justifient de changer la séance prévue. Elle montre ce qui change, pourquoi, et le plan d’origine à côté.

### Avec ou sans check-in

Avant ton check-in du matin, la proposition est lue sur ta nuit seule, et elle le dit. Une fois le check-in fait, elle est relue avec ton ressenti.

### Ta réponse

- **Alléger** ou **Augmenter** : la séance du jour est remplacée dans ton plan.
- **Garder le plan** : rien ne change.

Ta réponse est gardée dans la [mémoire des décisions](/aide/methode/memoire-des-decisions).
`,
    },
    {
      slug: 'rattraper-une-seance',
      title: 'Rattraper une séance ratée',
      summary:
        'Une séance manquée dans les sept derniers jours affiche « Rattraper ma semaine ». Une touche, et le coach propose de réorganiser la fin de ta semaine.',
      body: `
### Depuis le Plan

Sous la carte de la séance manquée, touche **Rattraper ma semaine**. L’ajustement s’ouvre avec le manque déjà expliqué au coach.

### Depuis la notification

Le lendemain d’une séance clé manquée, « Dommage pour hier » ouvre directement cet ajustement (si la notification **Séance manquée** est activée).

### Ajuster autrement

**Ajuster le planning**, dans le Plan, te laisse décrire n’importe quel changement : un déplacement, un week-end chargé, une douleur. Le coach propose, les [garde-fous](/aide/plan/garde-fous) vérifient, et tu gardes ou retires chaque changement avant de valider.
`,
    },
    {
      slug: 'enchainements',
      title: 'Les enchaînements',
      summary:
        'Un enchaînement, vélo puis course par exemple, est planifié, affiché et relu comme une seule séance, avec la transition entre les deux.',
      body: `
### Dans le plan

L’enchaînement est une seule entrée, marquée **Brick**. Son détail montre la chaîne, chaque partie avec ses étapes, et la transition.

### Une fois fait

Tant qu’au moins deux parties ont été enregistrées, il reste une seule séance faite, et tu notes ton effort une seule fois pour l’ensemble. S’il ne reste qu’une partie, elle redevient une séance simple.

### Le modifier

Un enchaînement est construit par le coach et se déplace en entier. Il ne s’édite pas à la main.
`,
    },
    {
      slug: 'modifier-ton-plan',
      title: 'Modifier ton plan à la main',
      summary:
        'Le « + » du Plan crée une séance. Le « … » d’une séance la modifie, la déplace sur l’un des sept prochains jours ou la supprime.',
      body: `
### Créer une séance

Touche **+** dans le Plan : sport, jour, durée, déroulé ou exercices de renforcement.

### Modifier, déplacer, supprimer

Ouvre la séance, puis **…** :

- **Modifier** : seuls les champs changés sont envoyés.
- **Déplacer** vers l’un des sept prochains jours.
- **Supprimer**, après confirmation.

Le changement s’affiche tout de suite et part en arrière-plan. S’il est refusé, la séance revient comme avant et un message te le dit.

### Délier une activité

Dans **Conformité au plan** d’une séance faite, tu peux délier l’activité : la séance redevient à faire et son analyse disparaît.
`,
    },
    {
      slug: 'objectifs',
      title: 'Tes objectifs et tes courses',
      summary:
        'Les objectifs s’ouvrent depuis le « … » du Plan. La prochaine course est en tête, puis les objectifs en cours, puis ceux atteints.',
      body: `
### Créer un objectif

Dans **Objectifs**, touche **+**. Une course a une date, un lieu et un sport ; en triathlon, son format (Sprint, M, 70.3, Ironman). Tu peux y ajouter un objectif de temps.

### Le modifier

Le **…** d’un objectif permet de le modifier ou de le supprimer. Déplacer la date d’une course garde le plan construit vers elle.

### Réalisations récentes

En bas de la liste, les objectifs récemment atteints, avec la valeur réalisée et la séance qui l’a établie.
`,
    },
    {
      slug: 'mode-dentrainement',
      title: 'Le mode d’entraînement',
      summary:
        'Actif, En pause, Blessé ou Malade. Le mode oriente ce que le plan et le coach peuvent te demander tant qu’il est actif.',
      body: `
Choisis-le depuis la puce de mode en haut du Résumé. Il est enregistré à chaque choix.

| Mode | Ce que ça change |
| --- | --- |
| **Actif** | Charge et séances suivent le plan. |
| **En pause** | Pas de charge volontaire, plan en veille jusqu’à la reprise. |
| **Blessé** | Priorité sécurité : adapter ou reporter les séances à risque. |
| **Malade** | Repos avant la charge, reprendre seulement quand le corps suit. |

Un mode avec une date de fin revient à **Actif** une fois la date passée.
`,
    },
  ],
};
