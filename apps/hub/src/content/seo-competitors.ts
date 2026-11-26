import { LANDING_GATE_RULE_COUNT } from '@sharpit/app/lib/landing/landing-copy';

export type CompetitorComparisonRow = {
  feature: string;
  sharpit: string;
  competitor: string;
  winner: 'sharpit' | 'competitor' | 'draw';
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type CompetitorData = {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  tagline: string;
  directAnswer: string;
  honestCompetitorStrengths: string[];
  sharpitSolution: string;
  comparisonRows: CompetitorComparisonRow[];
  faq: FaqItem[];
};

// Competitor cells only state what their public pages show; unverified features stay out.
export const COMPETITORS: Record<string, CompetitorData> = {
  runna: {
    slug: 'runna',
    name: 'Runna',
    metaTitle: 'Alternative à Runna : un plan qui se répare quand tu rates une séance',
    metaDescription:
      'Une séance saute ? SharpIt réorganise ta semaine et te propose chaque matin d’alléger la séance si ta nuit a été mauvaise.',
    h1: 'Alternative à Runna : SharpIt répare ton plan quand la semaine déraille',
    tagline: 'Un plan qui suit ta semaine réelle.',
    directAnswer: `Runna est réputé pour son guidage audio et ses séances sur tapis. SharpIt lit chaque matin ta nuit et ta VFC, puis te propose d’alléger ou de garder la séance. Si tu rates un entraînement, « Rattraper ma semaine » réorganise la suite, vérifiée par ${LANDING_GATE_RULE_COUNT} règles (espacement des séances intenses, charge hebdomadaire…).`,
    honestCompetitorStrengths: [
      'Guidage audio dynamique d’excellente qualité pour les séances de fractionné.',
      'Plans adaptés pour le tapis de course (treadmill workouts).',
      'Forte communauté anglophone et interface visuellement réussie.',
    ],
    sharpitSolution: `Avant d’afficher une séance, SharpIt la passe à ${LANDING_GATE_RULE_COUNT} contrôles : au plus 2 à 3 séances intenses par semaine, 24 h d’écart au minimum, charge hebdomadaire plafonnée. Une séance ratée ? « Rattraper ma semaine » (SharpIt Pro) recale la suite en un geste.`,
    comparisonRows: [
      {
        feature: 'Gestion d’une séance manquée',
        sharpit: '« Rattraper ma semaine », en un geste (Pro)',
        competitor: 'Décalage manuel',
        winner: 'sharpit',
      },
      {
        feature: 'Contrôles avant chaque séance',
        sharpit: `${LANDING_GATE_RULE_COUNT} règles vérifiées avant chaque séance`,
        competitor: 'Progression fixée par le plan',
        winner: 'draw',
      },
      {
        feature: 'Synchronisation Garmin',
        sharpit:
          'Lecture des séances et nuits dès la connexion + envoi des séances sur la montre (Pro)',
        competitor: 'Envoi des séances structurées',
        winner: 'draw',
      },
      {
        feature: 'Guidage vocal audio immersif',
        sharpit: 'Pas de guidage audio : ta Garmin affiche les étapes (Pro)',
        competitor: 'Cues audio riches dans les écouteurs',
        winner: 'competitor',
      },
    ],
    faq: [
      {
        question: 'Pourquoi changer de Runna pour SharpIt ?',
        answer:
          'Si tu prépares un objectif et que ta semaine déraille souvent (boulot, enfants, fatigue), SharpIt garde ton plan debout.',
      },
      {
        question: 'Comment SharpIt limite-t-il la surcharge ?',
        answer: `${LANDING_GATE_RULE_COUNT} contrôles avant chaque séance : 24 h d’écart au minimum entre deux séances intenses, charge hebdomadaire plafonnée. Et chaque matin, une proposition d’alléger si ta nuit ou ta VFC sortent de ton habitude. Tu gardes le dernier mot.`,
      },
      {
        question: 'Mes séances SharpIt vont-elles sur ma montre Garmin ?',
        answer:
          'Oui, pour les séances de course, de vélo et de natation. SharpIt lit tes nuits et tes séances dans Garmin Connect, et tu envoies une séance prévue sur la montre depuis son menu, avec ses étapes et ses cibles calculées d’après tes seuils. L’envoi demande un compte Garmin relié et SharpIt Pro. Les données Garmin arrivent à partir de la connexion (pas d’historique).',
      },
    ],
  },
  'campus-coach': {
    slug: 'campus-coach',
    name: 'Campus Coach',
    metaTitle: 'Alternative à Campus Coach : un plan qui se recale après un imprévu',
    metaDescription:
      'SharpIt recale ta semaine quand une séance saute, te propose chaque matin d’alléger selon ta nuit, et prépare course, vélo et natation dans un seul plan.',
    h1: 'Alternative à Campus Coach : ton plan se recale quand une séance saute',
    tagline:
      'Le plan suit ta semaine réelle. Tu prépares un triathlon ? Course, vélo, natation dans un seul plan.',
    directAnswer:
      'Campus Coach est reconnu pour sa méthode et ses allures cibles. SharpIt ajoute deux choses : chaque matin, une proposition selon ta nuit et ta VFC (Apple Santé, Garmin, Withings) ; après une séance ratée, « Rattraper ma semaine » recale la suite en gardant les séances clés.',
    honestCompetitorStrengths: [
      'Pédagogie remarquable issue de la communauté Running Addict.',
      'Séances variées avec calcul précis des allures selon ton chrono de référence.',
      'Excellente communauté francophone et entraide entre coureurs.',
    ],
    sharpitSolution:
      'Dès qu’une séance saute, « Rattraper ma semaine » (SharpIt Pro) te propose une nouvelle fin de semaine qui garde les séances clés. Et chaque matin, SharpIt lit ta nuit et te propose d’alléger la séance si besoin. Rien ne change sans ton accord.',
    comparisonRows: [
      {
        feature: 'Réorganisation après imprévu',
        sharpit: 'Proposée en un geste, séances clés gardées (Pro)',
        competitor: 'Ajustement manuel dans le calendrier',
        winner: 'sharpit',
      },
      {
        feature: 'Lecture du sommeil et de la VFC',
        sharpit: 'Oui, chaque matin dès que ta nuit est lue',
        competitor: 'Plan construit sur ton chrono de référence',
        winner: 'draw',
      },
      {
        feature: 'Calcul des allures cibles',
        sharpit: 'Séance allégée selon la forme du jour',
        competitor: 'Allures fixes déterminées au départ',
        winner: 'draw',
      },
      {
        feature: 'Préparation multi-sports (Triathlon)',
        sharpit: 'Course, vélo, natation dans un seul plan',
        competitor: 'Focalisé principalement sur la course à pied',
        winner: 'sharpit',
      },
      {
        feature: 'Contenu vidéo et conseils pédagogiques',
        sharpit: 'Justifications synthétiques des décisions',
        competitor: 'Richesse des vidéos et guides d’entraînement',
        winner: 'competitor',
      },
    ],
    faq: [
      {
        question: 'En quoi SharpIt est-il différent de Campus Coach ?',
        answer:
          'SharpIt regarde ta nuit chaque matin et recale le plan dès qu’une séance saute. Il prépare aussi course, vélo et natation dans un seul plan.',
      },
      {
        question: 'Puis-je préparer un marathon ou un triathlon avec SharpIt ?',
        answer:
          'Oui. SharpIt construit ta montée en charge jusqu’à ta course, choisit 2 à 3 séances clés par semaine et les garde en priorité quand une semaine déraille.',
      },
    ],
  },
};

export function allCompetitorSlugs(): string[] {
  return Object.keys(COMPETITORS);
}

export function findCompetitor(slug: string): CompetitorData | undefined {
  return COMPETITORS[slug];
}
