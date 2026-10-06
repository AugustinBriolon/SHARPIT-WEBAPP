import type { HelpCategory } from '../types';

export const CONFIDENTIALITE: HelpCategory = {
  slug: 'confidentialite',
  title: 'Confidentialité et données',
  description:
    'Tes consentements, où vont tes données, comment les exporter ou supprimer ton compte.',
  icon: 'privacy',
  articles: [
    {
      slug: 'consentements',
      title: 'Tes consentements',
      summary:
        'Trois sont requis ensemble : les conditions, la politique de confidentialité et le traitement de tes données de santé. Deux sont facultatifs : le traitement par IA et les sources non officielles.',
      body: `
### Requis

- Les [conditions d’utilisation](/terms).
- La [politique de confidentialité](/privacy).
- Le traitement de tes données de santé, sans lequel SharpIt ne peut rien synchroniser ni lire.

### Facultatifs

- **Le traitement par IA** : le coach, les semaines rédigées, les bilans. Sans lui, aucun contexte n’est envoyé à un modèle d’IA ; le verdict du jour et les lectures, qui sortent de règles fixes, fonctionnent toujours.
- **Les sources non officielles** : l’accusé de réception demandé avant de connecter Garmin.

À l’accueil, **Tout accepter** coche les cinq, parce que ta première semaine a besoin du coach.

### Les changer

**Paramètres › Confidentialité & conditions**, dans l’app, ou **Compte › Confidentialité** sur le carnet web. Retirer le consentement santé ramène l’écran de consentement : l’app ne lit plus rien tant que tu ne l’as pas redonné.

### Une nouvelle version des documents

Quand les conditions ou la politique changent, SharpIt te demande de les accepter à nouveau.
`,
    },
    {
      slug: 'ou-sont-tes-donnees',
      title: 'Où sont tes données ?',
      summary:
        'Sur les serveurs de SharpIt et de ses prestataires techniques, jamais dans iCloud. Pas de publicité, pas de revente, pas d’entraînement de modèle généraliste.',
      body: `
### Sur les serveurs

Ton compte et tes données sont gérés par des prestataires techniques (authentification, hébergement, base de données), listés dans la [politique de confidentialité](/privacy). Certains peuvent traiter des données hors de l’Union européenne, dans le cadre des garanties du RGPD.

### Sur ton iPhone

L’app garde un cache des dernières données lues, pour s’afficher hors connexion. Il reste sur l’appareil, n’est jamais copié dans iCloud, et il est effacé quand un autre compte se connecte ou que tu supprimes le tien.

### Ce que SharpIt ne fait pas

- Pas de publicité, ni de pistage entre applications ou sites.
- Pas de revente de tes données.
- Pas d’entraînement de modèles d’IA généralistes sur tes données.

SharpIt est un outil d’aide à l’entraînement, pas un dispositif médical.
`,
    },
    {
      slug: 'exporter-tes-donnees',
      title: 'Exporter tes données',
      summary:
        'Un fichier JSON avec ton profil, tes consentements, tes activités, ton plan et tes mesures. Jamais un identifiant de connexion.',
      body: `
### Depuis l’app

**Paramètres › Confidentialité & conditions › Tes données › Exporter mes données**. Le serveur prépare le fichier, puis la feuille de partage de l’iPhone s’ouvre : enregistre-le dans Fichiers ou envoie-le où tu veux.

### Depuis le carnet web

**Compte › Confidentialité**, sur [web.sharpit.app](https://web.sharpit.app).

### Ce qu’il contient

Ton profil, tes consentements, tes activités, ton plan et tes mesures, au format JSON. Le fichier est nommé par la date du jour, jamais par ton nom.
`,
    },
    {
      slug: 'supprimer-ton-compte',
      title: 'Supprimer ton compte',
      summary:
        'Tes données, les accès à tes sources et ton identifiant sont supprimés immédiatement et définitivement. Un abonnement en cours doit être résilié à part, dans l’App Store.',
      body: `
### Comment faire

**Paramètres › Confidentialité & conditions › Supprimer mon compte**, dans l’app, ou **Compte › Confidentialité** sur le carnet web. Une confirmation t’est demandée.

### Ce qui est supprimé

Ton compte, ton identifiant de connexion, tes données et les accès à tes sources connectées, immédiatement et définitivement. L’app se déconnecte et efface son cache. Un e-mail te confirme la suppression.

### Ton abonnement

Supprimer ton compte ne résilie pas un abonnement SharpIt Pro : il est géré par Apple. La confirmation te le rappelle et ouvre la gestion des abonnements de l’App Store en une touche (voir [gérer ton abonnement](/aide/compte/gerer-ton-abonnement)).

Pense à [exporter tes données](/aide/confidentialite/exporter-tes-donnees) avant, si tu veux les garder.
`,
    },
  ],
};
