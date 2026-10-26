export type AppReview = {
  rank: number;
  name: string;
  bestFor: string;
  pricing: string;
  strengths: string[];
  weaknesses: string[];
  verdict: string;
};

export type RoundupData = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  tagline: string;
  directAnswer: string;
  apps: AppReview[];
  selectionCriteria: string[];
  faq: { question: string; answer: string }[];
};

export const ROUNDUPS: Record<string, RoundupData> = {
  'meilleures-applications-plan-entrainement-running': {
    slug: 'meilleures-applications-plan-entrainement-running',
    metaTitle: 'Les 7 meilleures applications de plan d’entraînement running en 2026',
    metaDescription:
      'Comparatif honnête des meilleures applications de course à pied : Garmin Coach, SharpIt, Campus Coach, Runna, TrainingPeaks. Trouvez l’application idéale selon votre pratique.',
    h1: 'Les 7 meilleures applications de plan d’entraînement running en 2026',
    tagline: 'Un comparatif indépendant et transparent pour progresser sans se blesser.',
    directAnswer:
      'En 2026, la meilleure application de plan d’entraînement dépend de votre matériel et de votre flexibilité de vie : pour un coureur possédant une montre Garmin et cherchant un plan véritablement adaptatif qui s’ajuste chaque matin à la fatigue réelle, SharpIt est le choix n°1. Si vous cherchez une solution 100 % gratuite pour débuter sur 5 ou 10 km, Garmin Coach est suffisant. Si vous aimez le guidage vocal dynamique et la motivation sur tapis, choisissez Runna. Si vous voulez des plans communautaires structurés par allures fixes, Campus Coach reste une excellente référence.',
    selectionCriteria: [
      'Capacité d’adaptation en cas de séance ratée ou d’imprévu d’agenda.',
      'Lecture de la récupération physiologique réelle (sommeil, fréquence cardiaque, VFC).',
      'Protection contre le surentraînement et présence de garde-fous physiologiques.',
      'Facilité d’envoi des séances vers les montres de sport (Garmin, Apple Watch).',
      'Rapport qualité / prix et clarté de l’offre.',
    ],
    apps: [
      {
        rank: 1,
        name: 'SharpIt',
        bestFor: 'Coureurs réguliers cherchant un plan adaptatif et respectueux de leur fatigue',
        pricing: 'Freemium / Version complète sans engagement',
        strengths: [
          'Un plan qui se répare automatiquement dès qu’une séance saute.',
          'Une proposition chaque matin pour alléger ou maintenir l’effort selon la nuit.',
          '15 garde-fous stricts empêchant le surentraînement.',
          'Synchronisation Garmin Connect native avec explications claires.',
        ],
        weaknesses: [
          'Pas de guidage audio dans les écouteurs (tout passe par la montre).',
          'Pensé pour les sportifs réguliers plutôt que les sédentaires complets.',
        ],
        verdict:
          'L’outil le plus intelligent pour concilier progression sportive et vie de famille ou professionnelle chargée.',
      },
      {
        rank: 2,
        name: 'Garmin Coach / Suggestions Quotidiennes',
        bestFor: 'Débutants avec montre Garmin ne souhaitant rien payer en plus',
        pricing: 'Gratuit (inclus avec la montre Garmin)',
        strengths: [
          'Intégration matérielle parfaite avec la montre.',
          'Suggestions quotidiennes (DSW) basées sur la charge.',
          'Zéro abonnement supplémentaire.',
        ],
        weaknesses: [
          'Plans limités au semi-marathon (pas de vrai plan marathon ou ultra).',
          'Gestion catastrophique des séances manquées (décalage brutal ou disparition).',
          'Boîte noire : aucune explication sur les modifications d’allures.',
        ],
        verdict:
          'Très bien pour faire son premier 10 km, vite limité dès qu’on prépare une épreuve longue ou avec imprévus.',
      },
      {
        rank: 3,
        name: 'Campus Coach',
        bestFor: 'Coureurs appréciant la pédagogie et les plans par allures précises',
        pricing: 'Environ 12 à 15 € / mois',
        strengths: [
          'Excellente pédagogie signée Running Addict.',
          'Communauté active et entraide francophone.',
          'Plans personnalisés selon son chrono de référence.',
        ],
        weaknesses: [
          'Algorithme peu flexible face aux baisses de forme ponctuelles.',
          'Pas d’adaptation matinale automatique selon les nuits.',
        ],
        verdict:
          'Une valeur sûre pour les coureurs disciplinés capables de suivre un planning sans trop d’aléas.',
      },
      {
        rank: 4,
        name: 'Runna',
        bestFor: 'Coureurs sur tapis et amateurs de guidage vocal dynamique',
        pricing: 'Environ 18 $ / mois ou 120 $ / an',
        strengths: [
          'Guidage audio très immersif pendant les fractionnés.',
          'Compatibilité tapis de course bien pensée.',
          'Interface moderne et engageante.',
        ],
        weaknesses: [
          'Allures très agressives risquant la blessure (tendinites, périostites).',
          'Abonnement onéreux.',
        ],
        verdict:
          'Efficace si vous êtes jeune, en pleine forme et adorez vous faire encourager au casque.',
      },
      {
        rank: 5,
        name: 'TrainingPeaks',
        bestFor: 'Athlètes entraînés par un coach humain ou triathlètes confirmés',
        pricing: 'Gratuit limité ou 19 $ / mois + achat des plans (50 à 150 $)',
        strengths: [
          'Standard mondial pour l’analyse avancée (TSS, ATL, CTL).',
          'Plateforme idéale pour communiquer avec un véritable entraîneur.',
        ],
        weaknesses: [
          'Interface austère et complexe pour un amateur.',
          'Aucune adaptation automatisée intelligente du plan sans coach humain.',
        ],
        verdict:
          'L’outil professionnel incontournable avec un coach dédié, inutile et rebutant en solo.',
      },
      {
        rank: 6,
        name: 'Kiprun Pacer (Decathlon)',
        bestFor: 'Préparation marathon premier prix avec une approche simplifiée',
        pricing: 'Gratuit',
        strengths: [
          'Totalement gratuit.',
          'Algorithme simple d’estimation des chronos.',
          'Synchronisation avec la plupart des montres du marché.',
        ],
        weaknesses: [
          'Personnalisation basique.',
          'Manque de profondeur pour les coureurs intermédiaires et avancés.',
        ],
        verdict: 'Une belle initiative gratuite pour boucler son premier marathon sans se ruiner.',
      },
      {
        rank: 7,
        name: 'Nike Run Club (NRC)',
        bestFor: 'Course plaisir sans objectif de performance stricte',
        pricing: 'Gratuit',
        strengths: [
          'Séances audio guidées par des coachs et athlètes inspirants.',
          'Expérience utilisateur soignée et bienveillante.',
        ],
        weaknesses: ['Plans totalement figés.', 'Synchronisations tierces parfois instables.'],
        verdict:
          'Parfait pour se remettre au sport avec le sourire, insuffisant pour performer sur course officielle.',
      },
    ],
    faq: [
      {
        question: 'Quelle est la meilleure application de running gratuite ?',
        answer:
          'Si vous possédez une montre Garmin, Garmin Coach est la meilleure option sans frais. Pour courir au feeling sans montre, Nike Run Club offre la meilleure expérience gratuite.',
      },
      {
        question: 'Une application peut-elle remplacer un entraîneur humain ?',
        answer:
          'Pour 95 % des coureurs amateurs, une application adaptative comme SharpIt qui relit l’état physiologique et réorganise les séances offre une régularité et une sécurité équivalentes à un suivi personnalisé, pour un coût 10 à 20 fois inférieur.',
      },
    ],
  },
};

export function allRoundupSlugs(): string[] {
  return Object.keys(ROUNDUPS);
}

export function findRoundup(slug: string): RoundupData | undefined {
  return ROUNDUPS[slug];
}
