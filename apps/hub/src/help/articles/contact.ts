import type { HelpCategory } from '../types';

export const CONTACT: HelpCategory = {
  slug: 'contact',
  title: 'Nous contacter',
  description: 'Un bug, une idée, une question sur tes données : à qui écrire.',
  icon: 'contact',
  articles: [
    {
      slug: 'donner-un-avis',
      title: 'Signaler un bug ou proposer une idée',
      summary:
        'Depuis l’app : Paramètres › Donner un avis. Ton message arrive directement à l’équipe, avec la version de l’app. On lit tout.',
      body: `
### Depuis l’app

**Paramètres › Donner un avis**. Écris ce qui ne va pas ou ce qui te manque, puis envoie : le message part en arrière-plan avec la version de ton app, pour qu’on sache où chercher.

### Ce qui aide

- Ce que tu faisais, ce que tu attendais, ce qui s’est passé.
- L’écran concerné et le jour.
- Si c’est une donnée : la source (Garmin, Apple Santé…) et si elle apparaît dans l’app de ta montre.
`,
    },
    {
      slug: 'question-sur-tes-donnees',
      title: 'Une question sur tes données personnelles',
      summary:
        'Pour exercer tes droits ou poser une question de confidentialité, écris à l’adresse indiquée dans la politique de confidentialité.',
      body: `
### Ce que tu peux faire toi-même

- [Exporter tes données](/aide/confidentialite/exporter-tes-donnees).
- [Supprimer ton compte](/aide/confidentialite/supprimer-ton-compte).
- [Changer tes consentements](/aide/confidentialite/consentements).

### Écrire

Pour tout le reste (accès, rectification, opposition, question), écris à [augustin.briolon@gmail.com](mailto:augustin.briolon@gmail.com), le contact de la [politique de confidentialité](/privacy).

Tu peux aussi saisir la [CNIL](https://www.cnil.fr).
`,
    },
  ],
};
