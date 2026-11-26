import { LANDING_GATE_RULE_COUNT } from '@sharpit/app/lib/landing/landing-copy';

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

// Written by the SharpIt team: the ranking is ours and says so; competitor prices and
// limits stay generic until a dated public source backs them.
export const ROUNDUPS: Record<string, RoundupData> = {
  'meilleures-applications-plan-entrainement-running': {
    slug: 'meilleures-applications-plan-entrainement-running',
    metaTitle: 'Les 7 meilleures applications de plan d’entraînement running en 2026',
    metaDescription:
      'Comparatif par l’équipe SharpIt, critères publiés : Garmin Coach, Campus Coach, Runna, TrainingPeaks… Trouve l’application qui colle à ta pratique.',
    h1: 'Les 7 meilleures applications de plan d’entraînement running en 2026',
    tagline:
      'Comparatif écrit par l’équipe SharpIt. On se classe premiers : voici nos critères, à toi de juger.',
    directAnswer:
      'En 2026, la bonne application dépend de ton matériel et de ta semaine. Si tu veux un plan qui se recale après une séance ratée et une proposition chaque matin, SharpIt (c’est nous) répond à ce besoin. Pour débuter gratuitement sur 5 ou 10 km avec une montre Garmin, Garmin Coach suffit. Si tu aimes le guidage vocal et le tapis, regarde Runna. Si tu veux des plans par allures fixes avec une pédagogie poussée, Campus Coach reste une référence.',
    selectionCriteria: [
      'Capacité d’adaptation en cas de séance ratée ou d’imprévu d’agenda.',
      'Lecture de la récupération (sommeil, fréquence cardiaque, VFC).',
      'Contrôles de charge et d’espacement des séances intenses.',
      'Facilité d’envoi des séances vers les montres de sport (Garmin, Apple Watch).',
      'Rapport qualité / prix et clarté de l’offre.',
    ],
    apps: [
      {
        rank: 1,
        name: 'SharpIt',
        bestFor: 'Triathlètes et coureurs qui préparent une course avec une semaine chargée',
        pricing: 'Gratuit (données) · Pro 12,99 €/mois ou 99,99 €/an, sans engagement',
        strengths: [
          'Un plan qui se recale dès qu’une séance saute (Pro).',
          'Une proposition chaque matin pour alléger ou garder la séance selon ta nuit.',
          `${LANDING_GATE_RULE_COUNT} règles vérifiées avant chaque séance.`,
          'Garmin, Apple Santé, Strava, Withings reliés.',
        ],
        weaknesses: [
          'Pas de guidage audio dans les écouteurs (tout passe par la montre).',
          'Pensé pour les sportifs réguliers plutôt que les sédentaires complets.',
          'Pas d’application Android.',
          'Coach IA réservé à Pro.',
          'Garmin : les données arrivent à partir de la connexion, sans historique.',
        ],
        verdict: 'Pour l’athlète qui prépare un objectif avec une semaine chargée.',
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
        weaknesses: ['Réservé aux possesseurs d’une montre Garmin.'],
        verdict: 'Très bien pour faire son premier 10 km avec une montre Garmin.',
      },
      {
        rank: 3,
        name: 'Campus Coach',
        bestFor: 'Coureurs appréciant la pédagogie et les plans par allures précises',
        pricing: 'Abonnement payant (tarif sur leur site)',
        strengths: [
          'Excellente pédagogie signée Running Addict.',
          'Communauté active et entraide francophone.',
          'Plans personnalisés selon son chrono de référence.',
        ],
        weaknesses: ['Centré sur la course à pied.'],
        verdict:
          'Une valeur sûre pour les coureurs disciplinés capables de suivre un planning sans trop d’aléas.',
      },
      {
        rank: 4,
        name: 'Runna',
        bestFor: 'Coureurs sur tapis et amateurs de guidage vocal dynamique',
        pricing: 'Abonnement payant (tarif sur leur site)',
        strengths: [
          'Guidage audio très immersif pendant les fractionnés.',
          'Compatibilité tapis de course bien pensée.',
          'Interface moderne et engageante.',
        ],
        weaknesses: ['Abonnement payant.'],
        verdict: 'Bien si tu aimes être guidé à l’oreille pendant tes séances.',
      },
      {
        rank: 5,
        name: 'TrainingPeaks',
        bestFor: 'Athlètes entraînés par un coach humain ou triathlètes confirmés',
        pricing: 'Version gratuite limitée, Premium payant, plans vendus à part',
        strengths: [
          'Standard mondial pour l’analyse avancée (TSS, ATL, CTL).',
          'Plateforme idéale pour communiquer avec un véritable entraîneur.',
        ],
        weaknesses: [
          'Beaucoup de métriques à apprendre pour un amateur.',
          'Pensé d’abord pour travailler avec un coach humain.',
        ],
        verdict: 'La référence pour travailler avec un coach humain.',
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
        weaknesses: ['Pensé pour courir pour le plaisir plutôt que pour un objectif chronométré.'],
        verdict: 'Parfait pour se remettre au sport avec le sourire.',
      },
    ],
    faq: [
      {
        question: 'Quelle est la meilleure application de running gratuite ?',
        answer:
          'Si tu as une montre Garmin, Garmin Coach est une bonne option sans frais. Pour courir au feeling sans montre, Nike Run Club est une bonne option gratuite.',
      },
      {
        question: 'Une application peut-elle remplacer un entraîneur humain ?',
        answer:
          'Pour beaucoup d’amateurs, une app qui recale le plan suffit. Un coach humain reste utile pour un objectif élite ou une blessure. SharpIt Pro coûte 12,99 €/mois.',
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
