import { LANDING_GATE_RULE_COUNT } from '@sharpit/app/lib/landing/landing-copy';

export type GuideStep = {
  title: string;
  body: string;
};

export type GuideData = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  tagline: string;
  directAnswer: string;
  calloutTitle: string;
  calloutText: string;
  steps: GuideStep[];
  goldenRules: string[];
  faq: { question: string; answer: string }[];
};

export const GUIDES: Record<string, GuideData> = {
  'rattraper-seance-course-a-pied-sans-se-blesser': {
    slug: 'rattraper-seance-course-a-pied-sans-se-blesser',
    metaTitle: 'Comment rattraper une séance de course à pied ratée sans se blesser',
    metaDescription:
      'Séance manquée ? La règle pour réorganiser ta semaine d’entraînement sans te surcharger ni accumuler de fatigue inutile.',
    h1: 'Comment rattraper une séance d’entraînement ratée sans risquer la blessure',
    tagline: 'La règle d’or : ne double jamais le lendemain.',
    directAnswer:
      'Si tu as manqué une séance, ne double pas ton volume le lendemain et ne cherche pas à combler le kilométrage manquant. Si c’était un simple footing en endurance fondamentale, ignore-le : un footing raté ne change rien à ta préparation. S’il s’agissait d’une séance clé (fractionné, seuil ou sortie longue), déplace-la au surlendemain à la place d’un footing léger, en gardant au moins 24 h avant ta prochaine séance intense. Ne programme jamais deux séances dures deux jours de suite.',
    calloutTitle: 'Comment SharpIt gère tes séances manquées',
    calloutText: `Avec SharpIt Pro, « Rattraper ma semaine » recale tes jours restants, garde tes séances clés et vérifie chaque séance avec ${LANDING_GATE_RULE_COUNT} règles.`,
    steps: [
      {
        title: 'Étape 1 : Classer la séance manquée',
        body: 'Distingue d’abord une séance clé d’une séance de soutien. Une séance de soutien (footing de récupération de 40 min) peut être annulée sans remords. Une séance clé (allure spécifique, travail de seuil, sortie longue) mérite d’être sauvée si ton calendrier le permet.',
      },
      {
        title: 'Étape 2 : Vérifier l’écart de 24 h',
        body: 'Si tu déplaces ta séance clé, regarde la date de ta prochaine séance intense et garde au moins 24 h entre les deux. Si le délai est plus court, réduis le volume de moitié ou passe en endurance fondamentale.',
      },
      {
        title: 'Étape 3 : Ne jamais cumuler deux séances le même jour',
        body: 'Caser une séance de fractionné le matin et une sortie longue le soir ou le lendemain matin augmente le risque de surcharge des tibias et des tendons d’Achille.',
      },
      {
        title: 'Étape 4 : Écouter la forme du matin plutôt que l’agenda',
        body: 'Même si ton calendrier te permet de rattraper la séance, regarde ton niveau de fatigue (qualité de sommeil, fréquence cardiaque au repos, variabilité cardiaque). Si les signaux sont au rouge, accepte le repos.',
      },
    ],
    goldenRules: [
      'Séance manquée = 0 km à rattraper par orgueil.',
      'Les séances clés priment toujours sur le volume poubelle.',
      'Un repos imprévu est souvent plus bénéfique qu’une séance forcée dans la fatigue.',
      'Garde au moins 24 h d’écart entre deux efforts intenses.',
    ],
    faq: [
      {
        question: 'Est-ce grave de rater une sortie longue ?',
        answer:
          'Rater une seule sortie longue sur un plan de 12 semaines ne compromet pas ton objectif. Si tu as le temps le week-end suivant, tu pourras faire cette distance, mais n’écourte jamais ta semaine d’affûtage pour la caler.',
      },
      {
        question: 'Comment réagir si j’ai manqué une semaine entière pour maladie ?',
        answer:
          'Après une coupure de 7 jours, ne reprends jamais là où le plan en était. Reprends par 2 à 3 footings faciles à allure très lente avant de réintroduire de l’intensité.',
      },
    ],
  },
  'statut-garmin-non-productif-que-faire': {
    slug: 'statut-garmin-non-productif-que-faire',
    metaTitle: 'Statut Garmin « Non productif » : pourquoi et comment réagir ?',
    metaDescription:
      'Ta montre Garmin affiche le statut Non productif ? Comprends pourquoi ta charge monte alors que ta condition stagne, et comment ajuster tes séances dès aujourd’hui.',
    h1: 'Statut Garmin « Non productif » : pourquoi s’affiche-t-il et comment ajuster ton plan ?',
    tagline: 'Comprendre l’alerte de ta montre sans paniquer.',
    directAnswer:
      'Le statut d’entraînement « Non productif » sur ta montre Garmin signifie que ta charge reste stable ou monte alors que ta VO2 max estimée baisse. Les causes : mauvais sommeil, stress, chaleur, footings trop rapides. Passe 3 à 5 jours en endurance facile et regarde la tendance.',
    calloutTitle: 'SharpIt lit ta forme chaque matin',
    calloutText:
      'SharpIt lit chaque matin ta nuit et ta VFC (Apple Santé, Withings) et te propose d’alléger ou de garder la séance du jour.',
    steps: [
      {
        title: 'Cause n°1 : Trop de temps passé en zone grise',
        body: 'Le piège classique consiste à courir ses footings trop vite. Si tu cours à 80-85 % de ta FC max lors de tes sorties faciles, tu accumules de la fatigue sans stimuler efficacement ni ton aérobie ni ta vitesse.',
      },
      {
        title: 'Cause n°2 : Mauvaise récupération nocturne ou stress',
        body: 'Garmin calcule l’efficacité de ton entraînement en comparant l’effort fourni à la réponse cardiaque. Si tu es déshydraté, fatigué par le travail ou que ton sommeil a été haché, ton cœur bat plus vite à allure égale : la montre interprète cela comme une perte de forme.',
      },
      {
        title: 'La solution : quelques jours en vraie endurance fondamentale',
        body: 'Passe tes prochaines séances en totale aisance respiratoire (capacité à parler sans essoufflement). Laisse ta VFC remonter dans sa plage normale avant de programmer à nouveau un entraînement avec dénivelé ou fractionné.',
      },
    ],
    goldenRules: [
      'Un statut non productif est un appel à la récupération, pas à en faire plus.',
      'Fais environ 80 % de ton volume à basse intensité.',
      'La chaleur, la déshydratation et le manque de sommeil faussent la mesure de VO2 max.',
    ],
    faq: [
      {
        question: 'Combien de temps faut-il pour repasser en statut « Productif » ?',
        answer:
          'Le statut revient en général après quelques jours de récupération : repos ou footings très légers, avec un sommeil de qualité.',
      },
      {
        question: 'Faut-il arrêter totalement de courir ?',
        answer:
          'Non. L’arrêt complet n’est nécessaire qu’en cas de blessure ou de maladie. Des footings de 30 à 40 minutes à allure lente aident à récupérer.',
      },
    ],
  },
};

export function allGuideSlugs(): string[] {
  return Object.keys(GUIDES);
}

export function findGuide(slug: string): GuideData | undefined {
  return GUIDES[slug];
}
