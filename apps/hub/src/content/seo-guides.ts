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
      'Séance de running manquée ? Découvrez la règle exacte pour réorganiser votre semaine d’entraînement sans risquer la blessure ni accumuler de fatigue inutile.',
    h1: 'Comment rattraper une séance d’entraînement ratée sans risquer la blessure',
    tagline: 'La règle d’or : ne doublez jamais le lendemain.',
    directAnswer:
      'Si vous avez manqué une séance d’entraînement, la règle d’or est formelle : ne doublez jamais votre volume le lendemain et ne cherchez pas à combler le kilométrage manquant. Si la séance ratée était un simple footing en endurance fondamentale, ignorez-la : son impact sur votre forme est négligeable (< 2 %). S’il s’agissait d’une séance clé (fractionné, seuil ou sortie longue), déplacez-la au surlendemain en remplaçant un footing léger, à condition de conserver au moins 24 à 48 heures de récupération avant votre prochaine séance intense. Ne programmez jamais deux séances dures en deux jours consécutifs.',
    calloutTitle: 'Comment SharpIt gère vos séances manquées',
    calloutText:
      'Dans SharpIt, la commande « Rattraper ma semaine » rééquilibre automatiquement vos jours restants en préservant vos séances clés et en appliquant nos 13 garde-fous physiologiques.',
    steps: [
      {
        title: 'Étape 1 : Classifier la séance manquée',
        body: 'Distinguez immédiatement une séance clé d’une séance de soutien. Une séance de soutien (footing de récupération 40 min) peut être tout simplement annulée sans remords. Une séance clé (allure spécifique semi/marathon ou travail de seuil) mérite d’être sauvée si votre calendrier le permet.',
      },
      {
        title: 'Étape 2 : Vérifier la fenêtre des 24-48 heures',
        body: 'Si vous déplacez votre séance clé, vérifiez la date de votre prochaine séance intense. Vos tendons, vos articulations et votre système nerveux ont besoin de 48 heures pour assimiler un travail lactique ou neuromusculaire. Si le délai est trop court, réduisez le volume de moitié ou privilégiez l’endurance fondamentale.',
      },
      {
        title: 'Étape 3 : Ne jamais cumuler deux séances le même jour',
        body: 'Tenter de caser une séance de fractionné le matin et une sortie longue le soir ou le lendemain matin est la première cause de périostite tibiale et de tendinopathie achilléenne chez le coureur amateur en préparation d’objectif.',
      },
      {
        title: 'Étape 4 : Écouter la forme matinale plutôt que l’agenda',
        body: 'Même si votre calendrier vous autorise à rattraper la séance, vérifiez votre niveau de fatigue (qualité de sommeil, fréquence cardiaque au repos, variabilité cardiaque). Si les signaux sont au rouge, acceptez le repos.',
      },
    ],
    goldenRules: [
      'Séance manquée = 0 km à rattraper par orgueil.',
      'Les séances clés priment toujours sur le volume poubelle.',
      'Un repos imprévu est souvent plus bénéfique qu’une séance forcée dans la fatigue.',
      'Respecter impérativement 24h d’écart entre deux efforts intenses.',
    ],
    faq: [
      {
        question: 'Est-ce grave de rater une sortie longue ?',
        answer:
          'Rater une seule sortie longue sur un plan de 12 semaines ne compromet en rien votre objectif marathon. Si vous avez le temps le week-end suivant, vous pourrez courir cette distance, mais n’écourtez jamais votre semaine d’affûtage pour la caler.',
      },
      {
        question: 'Comment réagir si j’ai manqué une semaine entière pour maladie ?',
        answer:
          'Après une coupure de 7 jours, ne reprenez jamais là où le plan en était. Reprenez par 2 à 3 footings faciles à allure très lente pour réhabituer votre système cardiovasculaire avant de réintroduire de l’intensité.',
      },
    ],
  },
  'statut-garmin-non-productif-que-faire': {
    slug: 'statut-garmin-non-productif-que-faire',
    metaTitle: 'Statut Garmin « Non productif » : pourquoi et comment réagir ?',
    metaDescription:
      'Votre montre Garmin affiche le statut Non Productif ? Comprenez pourquoi votre charge augmente alors que votre condition stagne, et comment ajuster vos séances dès aujourd’hui.',
    h1: 'Statut Garmin « Non productif » : pourquoi s’affiche-t-il et comment ajuster votre plan ?',
    tagline: 'Comprendre l’alerte de votre montre sans paniquer.',
    directAnswer:
      'Le statut d’entraînement « Non productif » sur votre montre Garmin signifie que votre charge d’entraînement est suffisante ou élevée, mais que vos indicateurs de forme physique (notamment la VO2 max estimée et la variabilité cardiaque) déclinent. En clair : votre corps dépense de l’énergie mais ne parvient pas à l’assimiler en raison d’un manque de récupération, d’un sommeil dégradé, d’un stress extérieur ou d’une accumulation excessive d’allures trop rapides. Pour corriger ce statut en 5 à 7 jours, réduisez l’intensité globale de 30 %, supprimez les séances de fractionné court et courez exclusivement en endurance fondamentale sous votre premier seuil ventilatoire.',
    calloutTitle: 'SharpIt déchiffre les alertes de votre montre Garmin',
    calloutText:
      'Plutôt qu’un simple verdict anxiogène, SharpIt lit chaque matin vos nuits et votre VFC pour vous proposer une décision claire et explicite : alléger l’effort, maintenir ou insérer un repos réparateur.',
    steps: [
      {
        title: 'Cause n°1 : Trop de temps passé en zone grise',
        body: 'Le piège classique consiste à courir ses footings trop vite. Si vous courez à 80-85 % de votre FC max lors de vos sorties faciles, vous accumulez de la fatigue chronique sans stimuler efficacement ni votre aérobie ni votre vitesse.',
      },
      {
        title: 'Cause n°2 : Mauvaise récupération nocturne ou stress',
        body: 'Garmin calcule l’efficacité de votre entraînement en comparant l’effort fourni à la réponse cardiaque. Si vous êtes déshydraté, fatigué par le travail ou que votre sommeil a été haché, votre cœur bat plus vite à allure égale : la montre interprète cela comme une perte de forme.',
      },
      {
        title: 'La solution : 3 jours en vraie endurance fondamentale',
        body: 'Passez vos prochaines séances en totale aisance respiratoire (capacité à parler sans essoufflement). Laissez votre VFC remonter dans sa plage normale avant de programmer à nouveau un entraînement avec dénivelé ou fractionné.',
      },
    ],
    goldenRules: [
      'Un statut non productif est un appel à la récupération, pas à en faire plus.',
      '80 % de votre volume hebdomadaire doit impérativement se faire à basse intensité.',
      'La chaleur, la déshydratation et le manque de sommeil faussent la mesure de VO2 max.',
    ],
    faq: [
      {
        question: 'Combien de temps faut-il pour repasser en statut « Productif » ?',
        answer:
          'En observant 2 à 3 jours de repos ou de footings très légers avec un sommeil de qualité, votre VFC remontera et Garmin réajustera généralement votre statut sous 4 à 7 jours.',
      },
      {
        question: 'Faut-il arrêter totalement de courir ?',
        answer:
          'Non. L’arrêt complet n’est nécessaire qu’en cas de blessure ou de maladie. Des footings régénérants de 30 à 40 minutes à allure lente favorisent la circulation sanguine et accélèrent la récupération active.',
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
