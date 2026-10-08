import type { HelpCategory } from '../types';

export const COMPTE: HelpCategory = {
  slug: 'compte',
  title: 'Compte et SharpIt Pro',
  description: 'Ton profil, l’abonnement Pro, les widgets, les notifications et le calendrier.',
  icon: 'account',
  articles: [
    {
      slug: 'sharpit-pro',
      title: 'Ce que SharpIt Pro ajoute',
      summary:
        'Pro ajoute les lectures approfondies et quelques outils de confort. Ton plan, ton journal, ton journal alimentaire et toutes tes données restent accessibles sans abonnement.',
      body: `
### Ce qui reste gratuit

Tout ce qui t’appartient : ton plan et le coach, tes séances, ton journal, ton journal alimentaire, ton bilan Santé, tes sources, l’export de tes données.

### Ce que Pro ajoute

- **[Bilan de la semaine](/aide/coach/bilan-de-la-semaine)** rédigé par le coach, avec un plan pour la suivante.
- **[Analyse de séance](/aide/activite/relire-une-seance)** illimitée et sur tes séances passées (gratuite pour une séance par jour).
- **[Lecture coach de ta nutrition](/aide/nutrition/note-des-repas)**, chaque jour, face à ton entraînement.
- **[Âge biologique](/aide/sante/age-biologique)**, à partir de ta VO₂max.
- **Envoi vers la montre** de tes séances planifiées.
- **Écriture dans ton calendrier** (Google ou Calendrier Apple), quand tu choisis la source principale Agenda (voir [Calendrier Apple](/aide/sources/calendrier-apple) et [Google Agenda](/aide/sources/google-agenda)).
- **[Widgets supplémentaires](/aide/compte/widgets)** : sommeil, poids, volume de la semaine, régularité et prochain objectif.
- **Accès anticipé** aux nouveautés.

### Pourquoi c’est payant

SharpIt est construit par un athlète, sans publicité ni revente de données. L’abonnement le fait vivre.
`,
    },
    {
      slug: 'gerer-ton-abonnement',
      title: 'S’abonner, gérer ou résilier',
      summary:
        'SharpIt Pro s’achète dans l’app, au mois ou à l’année, par l’App Store. Il se gère et se résilie dans les réglages de ton identifiant Apple.',
      body: `
### S’abonner

**Paramètres › SharpIt Pro**, puis choisis la formule mensuelle ou annuelle. Le paiement passe par l’App Store.

### Gérer ou résilier

**Paramètres › SharpIt Pro › Gérer mon abonnement** ouvre la gestion de l’App Store. Tu peux aussi passer par les réglages de l’iPhone : ton nom › **Abonnements**. Pro reste actif jusqu’à la fin de la période payée.

### Restaurer un achat

Sur un nouvel iPhone, ou si Pro n’apparaît pas, utilise la restauration des achats sur la page SharpIt Pro. Ton achat est revérifié par SharpIt et rattaché à ton compte.

### Supprimer ton compte

Ne résilie pas l’abonnement : pense à le faire dans l’App Store (voir [supprimer ton compte](/aide/confidentialite/supprimer-ton-compte)).
`,
    },
    {
      slug: 'ton-profil',
      title: 'Modifier ton profil',
      summary:
        'Prénom, nom, sexe, taille et date de naissance se modifient dans Paramètres › Compte. L’e-mail, le mot de passe et la photo passent par la fenêtre de ton compte de connexion.',
      body: `
### Dans Compte

Prénom et nom, sexe, taille, date de naissance. Chaque champ s’enregistre seul, sans toucher aux autres.

### Seuils d’entraînement

Tes seuils (fréquence cardiaque, puissance, allures) sont dans **Paramètres › Entraînement › Seuils d’entraînement**. SharpIt peut te proposer de les mettre à jour depuis tes records, ou les importer de Garmin. Tu gardes ou écartes chaque proposition avant d’appliquer.

### Sports et matériel

**Paramètres › Sports & équipement** reprend les choix de l’accueil.

### Se déconnecter

En bas de **Compte**.
`,
    },
    {
      slug: 'widgets',
      title: 'Les widgets',
      summary:
        'Séance du jour, verdict du jour, nutrition, demander au coach et scanner un produit sont gratuits. Sommeil, poids, volume, régularité et prochain objectif sont Pro.',
      body: `
### Ajouter un widget

Appui long sur l’écran d’accueil ou l’écran verrouillé, **Modifier**, puis cherche SharpIt.

### Les widgets

| Widget | Accès |
| --- | --- |
| Séance du jour | Gratuit |
| Verdict du jour | Gratuit |
| Nutrition | Gratuit |
| Demander au coach (et son bouton du Centre de contrôle) | Gratuit |
| Scanner un produit (et son bouton) | Gratuit |
| Sommeil, Poids, Volume de la semaine, Régularité, Prochain objectif | Pro |

Le widget **Volume de la semaine** se règle par sport.

### Toucher un widget

Il ouvre la page qu’il représente. Un widget n’interroge jamais le serveur lui-même : il affiche ce que l’app a lu en dernier. Si ce n’est pas d’aujourd’hui, il l’indique.
`,
    },
    {
      slug: 'notifications',
      title: 'Les notifications',
      summary:
        'Six types, chacun activable : verdict du matin, bilan de la semaine, rappel de séance, séance faite, séance manquée et alertes de synchronisation.',
      body: `
Règle-les dans **Paramètres › Notifications**.

| Notification | Quand |
| --- | --- |
| Verdict du matin | Ta lecture du jour, une fois ta nuit synchronisée |
| Bilan de la semaine | Quand ton bilan est prêt |
| Rappel de séance | Une heure avant une séance prévue, ou à 7 h 30 si elle n’a pas d’heure |
| Séance faite | Après une séance synchronisée : sa part du plan et la suivante |
| Séance manquée | Le lendemain, pour réorganiser ta semaine en un geste |
| Alertes de synchronisation | Quand une source doit être reconnectée |

SharpIt n’envoie pas de notification pour te faire revenir, ni de série à ne pas casser.
`,
    },
    {
      slug: 'calendrier-iphone',
      title: 'Le calendrier de l’iPhone',
      summary:
        'Les séances planifiées s’écrivent dans ton calendrier quand Calendrier Apple (ou Google Agenda) est source principale Agenda (Pro, réglé dans Sources et Priorités).',
      body: `
### Où le régler

**Paramètres › Sources de données › Calendrier Apple**, puis **Priorités › Agenda** : active la source, mets-la **principale** si tu veux que SharpIt y écrive, et choisis le **calendrier d’écriture** (souvent un calendrier « SharpIt »).

Tu peux aussi utiliser [Google Agenda](/aide/sources/google-agenda) comme source principale ; voir [Choisir la source principale](/aide/sources/source-principale).

### Ce qui se passe ensuite (Pro)

Avec [SharpIt Pro](/aide/compte/sharpit-pro), SharpIt crée et met à jour tes séances dans ce calendrier. Touche un événement pour ouvrir la séance dans l’app. Si tu déplaces ou supprimes l’événement dans Calendrier, le plan suit au prochain sync.

### Le désactiver

Désactive Calendrier Apple dans Sources, ou choisis une autre source principale Agenda. Les événements déjà créés restent dans ton calendrier ; SharpIt ne les met plus à jour.
`,
    },
  ],
};
