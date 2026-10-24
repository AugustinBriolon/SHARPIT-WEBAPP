import type { HelpCategory } from '../types';

export const SOURCES: HelpCategory = {
  slug: 'sources',
  title: 'Sources connectées',
  description:
    'Garmin, Strava, Apple Santé, Withings, Google Agenda et Calendrier Apple : les connecter, choisir qui fait foi, les déconnecter.',
  icon: 'sources',
  articles: [
    {
      slug: 'quelles-sources',
      title: 'Quelles sources sont prises en charge ?',
      summary:
        'Garmin, Strava, Apple Santé, Withings, Google Agenda et Calendrier Apple se connectent. La nutrition se note dans SharpIt ; Apple Santé pourra aussi y écrire.',
      body: `
| Source | Ce qu’elle apporte | Où la connecter |
| --- | --- | --- |
| [Garmin](/aide/sources/garmin) | Séances, nuits, VFC, fréquence cardiaque au repos, stress, Body Battery, VO₂max | L’app iPhone |
| [Strava](/aide/sources/strava) | Séances et activités outdoor | Le carnet web |
| [Apple Santé](/aide/sources/apple-sante) | Nuits, VFC, fréquence cardiaque au repos, séances ; écrit aussi nutrition et poids notés dans SharpIt | L’app iPhone |
| [Withings](/aide/sources/withings) | Poids et composition corporelle | Le carnet web |
| [Google Agenda](/aide/sources/google-agenda) | Créneaux occupés ; avec Pro, écriture des séances si c’est la source principale Agenda | Carnet web (connexion) ; app iPhone (calendrier d’écriture) |
| [Calendrier Apple](/aide/sources/calendrier-apple) | Créneaux occupés depuis ton iPhone ; avec Pro, écriture des séances si c’est la source principale Agenda | L’app iPhone |
| Journal SharpIt | Repas notés dans l’app (recherche, scan, recettes) | L’app iPhone |

**Bientôt** : Polar.

### Faut-il une montre Garmin ?

Non. Une Apple Watch suffit, par Apple Santé. Si tu as les deux, Garmin fait foi et Apple Santé comble les trous, sauf si tu en décides autrement (voir [la source principale](/aide/sources/source-principale)).
`,
    },
    {
      slug: 'garmin',
      title: 'Connecter Garmin',
      summary:
        'Garmin se connecte depuis l’app avec ta clé API personnelle Garmin. SharpIt la garde chiffrée et ne l’affiche plus jamais.',
      body: `
### Le connecter

1. Sur Garmin Connect (web), dans les paramètres de ton compte, crée une clé API personnelle. Garmin ne l’affiche qu’une fois : copie-la. L’app y mène par **Créer ma clé sur Garmin Connect**.
2. Dans l’app, **Paramètres › Sources de données › +  › Garmin**, colle la clé et touche **Connecter Garmin**.

SharpIt vérifie la clé auprès de Garmin avant de la garder. Elle est chiffrée sur nos serveurs, n’est jamais affichée à nouveau (seuls ses quatre derniers caractères le sont) et ne sert qu’à lire tes données Garmin.

### Pendant la bêta

La clé personnelle est prévue par Garmin pour l’usage d’une personne : Garmin est ouvert à quelques athlètes de la bêta. La connexion en un geste arrivera quand Garmin aura validé SharpIt.

### La renouveler ou la révoquer

Une clé expire après la durée choisie chez Garmin (30 jours à un an). Révoque-la quand tu veux sur Garmin Connect : SharpIt arrête de lire et te demande une nouvelle clé. **Déconnecter Garmin** efface la clé de nos serveurs ; ce qui est déjà importé est conservé.

### L’historique

À la connexion, SharpIt importe tes séances et tes nuits récentes, puis se tient à jour seul. Tu peux relancer une synchronisation depuis Sources de données.

### Une montre Garmin sans connexion directe

Si Garmin Connect partage tes données avec Apple Santé, ta montre arrive aussi dans SharpIt par [Apple Santé](/aide/sources/apple-sante).
`,
    },
    {
      slug: 'apple-sante',
      title: 'Activer Apple Santé',
      summary:
        'Un interrupteur dans Sources de données. SharpIt lit ta dernière année, puis ce qui arrive : nuits, VFC, fréquence cardiaque au repos et séances.',
      body: `
### L’activer

**Paramètres › Sources de données › Apple Santé**, puis autorise lecture et écriture dans la fenêtre d’Apple. SharpIt lit nuits, cœur et séances, et peut écrire le total alimentaire du jour et le poids notés dans l’app.

### Ce qui est envoyé

- **À l’activation** : ta dernière année.
- **Ensuite** : ce qui arrive depuis le dernier envoi. Une nuit ou une séance écrite dans Santé réveille l’app et part aussitôt, pour que ton verdict du matin arrive dès que ta nuit est lue.

### Un interrupteur par compte

Si un autre compte SharpIt se connecte sur le même iPhone, Apple Santé y démarre désactivé.

### Tes données Santé

Elles servent uniquement à ton coaching. Elles ne sont ni partagées à des fins publicitaires ou commerciales, ni stockées dans iCloud.
`,
    },
    {
      slug: 'strava',
      title: 'Connecter Strava',
      summary:
        'Strava se connecte depuis le carnet web, dans Compte › Sources. Tes activités arrivent ensuite dans SharpIt.',
      body: `
### Le connecter

1. Ouvre [web.sharpit.app](https://web.sharpit.app) et connecte-toi avec le même compte que dans l’app.
2. Va dans **Compte › Sources** et choisis **Strava**.
3. Autorise SharpIt chez Strava.

La connexion passe par ton navigateur : tu peux la déconnecter depuis l’app iPhone une fois reliée.

### Ce qui arrive

Tes séances Strava alimentent **Activités** et peuvent devenir la source principale si tu n’as pas Garmin.
`,
    },
    {
      slug: 'withings',
      title: 'Connecter Withings',
      summary:
        'Withings se connecte depuis le carnet web, dans Compte › Sources. Ton poids et ta composition corporelle arrivent ensuite dans Santé.',
      body: `
### Le connecter

1. Ouvre [web.sharpit.app](https://web.sharpit.app) et connecte-toi avec le même compte que dans l’app.
2. Va dans **Compte › Sources** et choisis **Withings**.
3. Autorise SharpIt chez Withings.

La connexion passe par ton navigateur : c’est pourquoi elle ne se fait pas encore dans l’app.

### Ce qui arrive

Poids, masse grasse, graisse viscérale, muscle, dans **Santé › Corps**. Les âges estimés par ta balance restent les siens, montrés à part.
`,
    },
    {
      slug: 'google-agenda',
      title: 'Connecter Google Agenda',
      summary:
        'Google Agenda se connecte depuis le carnet web. Tes créneaux occupés alimentent le coach ; avec Pro, SharpIt peut aussi y écrire tes séances si tu le mets source principale Agenda.',
      body: `
### Le connecter

Sur [web.sharpit.app](https://web.sharpit.app), **Compte › Sources › Google Agenda**, puis autorise SharpIt chez Google.

Dans l’app iPhone, **Paramètres › Sources de données › Priorités › Agenda**, choisis le **calendrier d’écriture** Google si tu l’utilises comme source principale.

### Ce que ça change

Un [garde-fou](/aide/plan/garde-fous) vérifie qu’aucune séance proposée n’entre en conflit avec ton agenda, dès que Google Agenda est activé pour la catégorie Agenda.

### Écrire tes séances (Pro)

Avec [SharpIt Pro](/aide/compte/sharpit-pro), SharpIt **écrit et suit** tes séances planifiées dans le calendrier Google choisi **seulement** si Google Agenda est ta [source principale](/aide/sources/source-principale) pour **Agenda**. Si [Calendrier Apple](/aide/sources/calendrier-apple) est principal, Google reste utile pour tes créneaux occupés, sans double écriture.

### Avec Calendrier Apple

Tu peux activer les deux : une seule source principale écrit ; l’autre contribue aux créneaux occupés. Voir [Calendrier Apple](/aide/sources/calendrier-apple).
`,
    },
    {
      slug: 'calendrier-apple',
      title: 'Connecter Calendrier Apple',
      summary:
        'Calendrier Apple se connecte depuis l’app iPhone. Tes événements locaux alimentent le coach ; avec Pro, SharpIt peut y écrire tes séances si tu le mets source principale Agenda.',
      body: `
### Le connecter

**Paramètres › Sources de données › Calendrier Apple**, autorise l’accès au calendrier iOS, puis règle **Priorités › Agenda** : active la source, choisis-la comme principale si tu veux que SharpIt y écrive, et sélectionne le **calendrier d’écriture** (par défaut un calendrier « SharpIt »).

### Ce que ça change

SharpIt envoie tes créneaux occupés lus sur l’iPhone pour le coach et les [garde-fous](/aide/plan/garde-fous), même si Google Agenda est aussi connecté.

### Écrire tes séances (Pro)

Avec [SharpIt Pro](/aide/compte/sharpit-pro), quand Calendrier Apple est **source principale Agenda**, SharpIt crée et met à jour tes séances dans le calendrier choisi. Si tu déplaces ou supprimes un événement SharpIt dans Calendrier, le plan suit au prochain sync.

### Avec Google Agenda

Les deux peuvent rester activés : **une seule** source principale écrit ; l’autre ne fait que signaler les créneaux occupés. Changer de principale laisse les anciens événements dans l’ancien calendrier ; SharpIt n’y touche plus.
`,
    },
    {
      slug: 'source-principale',
      title: 'Choisir la source principale',
      summary:
        'Quand deux sources mesurent la même chose, la source principale fait foi et les autres comblent ce qui lui manque. Tu la choisis par catégorie.',
      body: `
Ouvre **Paramètres › Sources de données › Priorités par catégorie**.

### Par catégorie de données

Pour chaque catégorie (séances, sommeil, corps, **agenda**…), active ou désactive chaque source connectée, et choisis celle qui fait foi.

Pour **Agenda**, la source principale est la seule qui **écrit** tes séances planifiées dans un calendrier externe (Pro). Les autres sources connectées peuvent quand même indiquer tes créneaux occupés au coach.

### Par défaut

Garmin fait foi quand il est connecté ; Apple Santé comble les trous. Sans Garmin, Apple Santé suffit à faire fonctionner toute l’app.

### Rien n’est réécrit

Chaque mesure garde sa source et son heure. Changer de source principale change ce qui est lu, pas ce qui a été enregistré.
`,
    },
    {
      slug: 'synchronisation',
      title: 'Quand mes données arrivent-elles ?',
      summary:
        'L’app synchronise tes sources à l’ouverture, au retour dans l’app et quand tu tires pour rafraîchir. Le serveur synchronise aussi de son côté.',
      body: `
### Côté app

À chaque ouverture, à chaque retour dans l’app et quand tu tires un écran vers le bas. Après une synchronisation, l’app dit ce qui est arrivé.

### Côté serveur

Le serveur synchronise régulièrement tes sources, et relit ton état seulement quand de nouvelles données sont arrivées.

### Une donnée manque ?

1. Vérifie que ta montre a bien synchronisé avec son application.
2. Tire l’écran vers le bas dans SharpIt.
3. Si une source doit être reconnectée, une notification **Alertes de synchronisation** te le dit.
`,
    },
    {
      slug: 'deconnecter-une-source',
      title: 'Déconnecter une source',
      summary:
        'Depuis sa ligne dans Sources de données. SharpIt te dit ce qui s’arrête et ce qui reste, puis révoque l’accès chez le fournisseur.',
      body: `
### Comment faire

**Paramètres › Sources de données**, touche la source, puis **Déconnecter**. Une confirmation te dit ce qui s’arrête et ce qui reste.

### Ce qui se passe

L’accès est révoqué chez le fournisseur. Les données déjà reçues restent dans ton historique ; rien de nouveau n’arrive.

### Apple Santé

Désactive son interrupteur dans Sources de données. Pour retirer l’autorisation de lecture elle-même, passe par les réglages de Santé sur ton iPhone.
`,
    },
  ],
};
