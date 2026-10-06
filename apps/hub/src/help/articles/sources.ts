import type { HelpCategory } from '../types';

export const SOURCES: HelpCategory = {
  slug: 'sources',
  title: 'Sources connectées',
  description:
    'Garmin, Apple Santé, Withings et Google Agenda : les connecter, choisir qui fait foi, les déconnecter.',
  icon: 'sources',
  articles: [
    {
      slug: 'quelles-sources',
      title: 'Quelles sources sont prises en charge ?',
      summary:
        'Garmin, Apple Santé, Withings et Google Agenda se connectent. L’historique MyFitnessPal s’importe. Strava et Polar arrivent bientôt.',
      body: `
| Source | Ce qu’elle apporte | Où la connecter |
| --- | --- | --- |
| [Garmin](/aide/sources/garmin) | Séances, nuits, VFC, fréquence cardiaque au repos, stress, Body Battery, VO₂max | L’app iPhone |
| [Apple Santé](/aide/sources/apple-sante) | Nuits, VFC, fréquence cardiaque au repos et séances de ton iPhone et de ton Apple Watch | L’app iPhone |
| [Withings](/aide/sources/withings) | Poids et composition corporelle | Le carnet web |
| [Google Agenda](/aide/sources/google-agenda) | Tes créneaux occupés, pour placer les séances | Le carnet web |
| [MyFitnessPal](/aide/nutrition/importer-myfitnesspal) | Ton historique alimentaire | Import de ton export |

**Bientôt** : Strava et Polar.

### Faut-il une montre Garmin ?

Non. Une Apple Watch suffit, par Apple Santé. Si tu as les deux, Garmin fait foi et Apple Santé comble les trous, sauf si tu en décides autrement (voir [la source principale](/aide/sources/source-principale)).
`,
    },
    {
      slug: 'garmin',
      title: 'Connecter Garmin',
      summary:
        'Garmin se connecte depuis l’app, dans une fenêtre de connexion Garmin. Ton historique complet est importé à la première connexion.',
      body: `
### Le connecter

**Paramètres › Sources de données › Garmin**, puis connecte-toi dans la fenêtre Garmin qui s’ouvre. Tes identifiants Garmin sont chiffrés.

### L’historique

À la première connexion, SharpIt importe tout ton historique Garmin. Si l’import est interrompu, il reprend à la prochaine ouverture de l’app. Tu peux le relancer depuis Sources de données.

### Une connexion non officielle

L’accès à Garmin Connect n’est ni fourni ni approuvé par Garmin. Il est proposé en l’état, peut cesser de fonctionner, et un accusé de réception t’est demandé avant de le connecter. Pendant la bêta, il est disponible dans l’app.

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

**Paramètres › Sources de données › Apple Santé**, puis autorise la lecture dans la fenêtre d’Apple. SharpIt ne fait que lire : il n’écrit rien dans Santé.

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
        'Google Agenda se connecte depuis le carnet web. Le coach voit tes créneaux occupés pour ne pas placer une séance en conflit.',
      body: `
### Le connecter

Sur [web.sharpit.app](https://web.sharpit.app), **Compte › Sources › Google Agenda**, puis autorise SharpIt chez Google.

### Ce que ça change

Un [garde-fou](/aide/plan/garde-fous) vérifie qu’aucune séance proposée n’entre en conflit avec ton agenda.

### Dans l’autre sens

Pour voir tes séances dans le calendrier de ton iPhone, voir [Calendrier de l’iPhone](/aide/compte/calendrier-iphone).
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

Pour chaque catégorie (séances, sommeil, corps…), active ou désactive chaque source connectée, et choisis celle qui fait foi.

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
