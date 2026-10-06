import type { HelpCategory } from '../types';

export const PREMIERS_PAS: HelpCategory = {
  slug: 'premiers-pas',
  title: 'Premiers pas',
  description: 'Ce que fait SharpIt, créer ton compte et t’y retrouver dans l’app.',
  icon: 'start',
  articles: [
    {
      slug: 'quest-ce-que-sharpit',
      title: 'Qu’est-ce que SharpIt ?',
      summary:
        'Un coach d’endurance pour la course, le vélo, la natation et le triathlon. Il construit ta semaine vers ta course, la relit chaque matin et la répare quand la vie s’en mêle.',
      body: `
SharpIt part d’un modèle de toi, nourri par ce que tes appareils mesurent : séances, charge, mesures du matin, agenda. Chaque matin, il en tire **une décision** pour ta journée, avec ses raisons et son niveau de confiance.

### Ce qu’il fait pour toi

- **Il programme** une semaine vers ton objectif, selon tes jours libres et ton matériel.
- **Il relit** ta journée chaque matin et te dit si la séance prévue tient toujours.
- **Il répare** le plan quand ta forme change ou qu’une séance saute, et ne modifie rien sans ton accord.
- **Il se souvient** de ce qu’il t’a conseillé, de ce que tu as choisi et de ce qui a suivi.

### Pour quels sports

Course, vélo, natation, triathlon et renforcement. Un enchaînement vélo puis course est planifié et relu comme une seule séance.

### Ce que SharpIt n’est pas

Un outil d’aide à l’entraînement, pas un dispositif médical. Ses lectures sont des estimations d’entraînement, jamais un diagnostic.
`,
    },
    {
      slug: 'creer-ton-compte',
      title: 'Créer ton compte',
      summary:
        'Ton compte se crée dans l’app iPhone, avec Apple ou Google. L’app est aujourd’hui en bêta, avant sa sortie sur l’App Store.',
      body: `
### Dans l’app iPhone

Ouvre SharpIt et connecte-toi avec **Apple** ou **Google**. Aucun mot de passe à inventer : ton compte est créé à la première connexion.

### Pendant la bêta

L’app est distribuée par TestFlight à un petit groupe d’athlètes qui préparent une course, avant sa sortie sur l’App Store. En attendant, la [démo](https://web.sharpit.app/demo) ouvre le carnet web sur un compte d’exemple.

### Sur le web

Le carnet web ([web.sharpit.app](https://web.sharpit.app)) sert à relire ta saison sur grand écran. Il ne crée pas de compte : l’inscription et l’accueil se font dans l’app.
`,
    },
    {
      slug: 'parcours-daccueil',
      title: 'Le parcours d’accueil',
      summary:
        'À la première connexion, quelques étapes posent ce dont le coach a besoin : toi, tes sports, ton matériel, ta semaine, ton objectif, tes blessures et tes sources.',
      body: `
Chaque étape est enregistrée dès que tu la quittes. Si tu fermes l’app en route, tu reprends là où tu t’étais arrêté.

### Les étapes

1. **Toi** : prénom, sexe, taille et date de naissance.
2. **Sports** : ce que tu pratiques.
3. **Matériel** : ce que tu as sous la main, sport par sport.
4. **Ta semaine** : les jours et créneaux où tu peux t’entraîner.
5. **Objectif** : ta course, sa date et son lieu. En triathlon, tu choisis le format (Sprint, M, 70.3, Ironman), et tu peux indiquer un objectif de temps.
6. **Blessures** : les zones à ménager. Le coach les lit comme des [zones sensibles](/aide/sante/zones-sensibles).
7. **Confidentialité** : les [consentements](/aide/confidentialite/consentements), si tu ne les as pas encore donnés.
8. **Sources** : [Apple Santé](/aide/sources/apple-sante), et Garmin quand il est proposé.
9. **Première semaine** : le coach prépare tes sept prochains jours vers ton objectif. Tu l’ajoutes à ton plan d’une touche.

### Sans le consentement IA

La première semaine est rédigée par le coach, qui a besoin du traitement par IA. Sans ce consentement, l’accueil se termine sans semaine : tu pourras l’activer plus tard dans **Paramètres › Confidentialité**, puis demander ta semaine depuis le Plan.
`,
    },
    {
      slug: 'les-cinq-onglets',
      title: 'Les cinq onglets de l’app',
      summary:
        'Résumé, Plan, Coach, Activité et Santé. Les Paramètres s’ouvrent depuis ton avatar, en haut du Résumé.',
      body: `
| Onglet | Ce que tu y trouves |
| --- | --- |
| **Résumé** | Le verdict du matin, ta séance du jour, ta récupération, ton sommeil, ta régularité et ta nutrition. |
| **Plan** | Ta semaine, tes séances clés, tes objectifs et ta trajectoire (effort et adaptation). |
| **Coach** | Une conversation avec le coach, qui répond depuis ton modèle. |
| **Activité** | Tes séances relues face au plan, tes records et tes séjours. |
| **Santé** | Un bilan rangé par ce qui compte, et tes zones sensibles. |

### Les Paramètres

Touche ton avatar en haut du Résumé. Tu y trouves ton compte, SharpIt Pro, l’apparence, les notifications, tes sources de données, tes sports et ton matériel, la densité de lecture, la confidentialité et **Donner un avis**.

### Masquer une partie de l’app

Journal, Nutrition, Santé et Régularité peuvent être masqués dans **Paramètres › Pages et widgets**. Tes données sont gardées, et tout revient quand tu les réaffiches.
`,
    },
    {
      slug: 'carnet-web',
      title: 'Le carnet web',
      summary:
        'web.sharpit.app relit ta saison sur grand écran. Il lit, il n’écrit pas : tout ce qui se fait se fait dans l’app iPhone.',
      body: `
Un navigateur est fait pour relire : une saison d’un coup d’œil, la carte et les courbes d’une séance en grand. Le carnet web est pensé pour ça.

### Ce que tu y lis

Aujourd’hui, la saison, les bilans, les séances, les records, le corps et la nutrition.

### Ce qui reste une action sur le web

- Connecter les sources qui passent par ton navigateur : [Withings](/aide/sources/withings) et [Google Agenda](/aide/sources/google-agenda).
- Tes droits sur tes données : consentements, [export](/aide/confidentialite/exporter-tes-donnees) et [suppression du compte](/aide/confidentialite/supprimer-ton-compte).

Tout le reste, programmer, modifier, discuter avec le coach, noter un repas, se fait dans l’app.
`,
    },
    {
      slug: 'lecture-essentielle-ou-experte',
      title: 'Lecture essentielle ou experte',
      summary:
        'Deux façons de lire les mêmes chiffres. L’essentielle parle en mots simples, l’experte ajoute les termes et les courbes techniques. Rien n’est mesuré différemment.',
      body: `
Choisis ta densité dans **Paramètres › Densité de lecture**. Elle change ce qui est montré et comment c’est nommé, jamais ce qui est mesuré.

### Ce qui change

| | Essentielle | Experte |
| --- | --- | --- |
| Charge d’une séance | « charge 78 » | « 78 TSS » |
| Effort | Charge du jour, charge 7 j, montée, forme | TSS du jour, TSS 7 j, ACWR, TSB |
| Plan | La semaine | La semaine et la courbe de forme (CTL, ATL, TSB) |
| Activité | La séance relue | Plus l’analyse technique des courbes |
| Records vélo | Les records | Plus ta courbe de puissance |

La densité n’est pas un niveau d’abonnement : elle ne débloque rien, elle règle le vocabulaire.
`,
    },
  ],
};
