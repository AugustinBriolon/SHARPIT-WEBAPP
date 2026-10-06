import type { HelpCategory } from '../types';

export const ACTIVITE: HelpCategory = {
  slug: 'activite',
  title: 'Activité',
  description: 'Tes séances relues face au plan, tes records et tes séjours.',
  icon: 'activity',
  articles: [
    {
      slug: 'relire-une-seance',
      title: 'Relire une séance',
      summary:
        'Chaque séance faite est rapprochée de ce qui était prévu. Sa page montre la carte, les courbes, la conformité au plan et l’analyse de la séance.',
      body: `
### La conformité au plan

Quand une séance faite correspond à une séance prévue, SharpIt les relie et dit dans quelle mesure tu as suivi le plan. Une notification « Séance dans la boîte » peut te prévenir, avec sa part du plan et la séance suivante.

### L’analyse de séance

Ce qui a marché, ce qui a coûté cher, ce que ça change pour la suite. Elle est gratuite pour une séance par jour ; illimitée et sur tes séances passées avec [SharpIt Pro](/aide/compte/sharpit-pro). Le **…** de la conformité propose **Réanalyser**.

### La carte

Dans la carte agrandie, le calque **Heatmap** colore le parcours par fréquence cardiaque (ou par vitesse sans elle). Le bouton lecture redessine ton parcours du départ à l’arrivée.

### Les douleurs

Après une séance, SharpIt peut te demander où en est une douleur ou une [zone sensible](/aide/sante/zones-sensibles) ouverte.
`,
    },
    {
      slug: 'saisir-une-seance',
      title: 'Saisir une séance à la main',
      summary:
        'Le « + » de l’onglet Activité enregistre une séance que ta montre n’a pas captée : sport, durée, distance, effort, ressenti et notes.',
      body: `
### Créer

Touche **+** dans Activité, puis renseigne le sport, le début, la durée et les mesures du sport (distance en km, en mètres pour la natation, dénivelé, fréquence cardiaque moyenne). Pour le renforcement, ajoute tes exercices.

### Modifier ou supprimer

Le **…** d’une séance faite permet de la modifier ou de la supprimer après confirmation. Le plan et la liste se mettent à jour.

### Envoyer vers la montre

Une séance de renforcement peut être envoyée à ta montre Garmin depuis ce même menu, avec [SharpIt Pro](/aide/compte/sharpit-pro).
`,
    },
    {
      slug: 'records',
      title: 'Tes records',
      summary:
        'La tuile Records, en haut d’Activité, range tes meilleures performances en course, vélo et natation, avec leur date et la séance d’origine.',
      body: `
### Par sport

Course, Vélo ou Natation : chaque catégorie montre ton record, son âge (« il y a 3 mois », « record de la saison »), puis les quatre suivants. Un record de moins de deux semaines porte **Nouveau**.

### En course

Tes meilleurs temps sur chaque distance de référence.

### En vélo

En [lecture experte](/aide/premiers-pas/lecture-essentielle-ou-experte), ta courbe de puissance : glisse le doigt pour lire chaque durée.

Touche un record pour ouvrir la séance qui l’a établi.
`,
    },
    {
      slug: 'sejours',
      title: 'Les séjours de randonnée',
      summary:
        'Plusieurs jours de randonnée réunis sous un nom, avec leurs totaux, les lieux traversés et les étapes dans l’ordre.',
      body: `
### Créer un séjour

Ouvre une randonnée, puis **…** › **Lier à d’autres randonnées**. Choisis les étapes à réunir et donne un nom. Une randonnée appartient à un seul séjour.

### Le retrouver

**Séjours** apparaît sous le titre d’Activité dès que ton historique contient une randonnée.

### Le modifier

Renomme-le, retire une étape d’un glissement (jamais la dernière) ou supprime le séjour : ses randonnées restent, simplement détachées.
`,
    },
  ],
};
