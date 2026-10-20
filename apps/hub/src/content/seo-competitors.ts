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
  complaintsFromRunners: string[];
  sharpitSolution: string;
  comparisonRows: CompetitorComparisonRow[];
  faq: FaqItem[];
};

export const COMPETITORS: Record<string, CompetitorData> = {
  runna: {
    slug: 'runna',
    name: 'Runna',
    metaTitle: 'Meilleure alternative à Runna : le plan running qui s’adapte sans blesser',
    metaDescription:
      'Vous cherchez une alternative à Runna sans le risque de blessure ? Découvrez comment SharpIt répare votre plan et ajuste vos séances chaque matin selon votre fatigue réelle.',
    h1: 'Vous cherchez une alternative à Runna ? Voici pourquoi les coureurs choisissent SharpIt',
    tagline: 'L’antidote aux allures punitives et aux plans rigides.',
    directAnswer:
      'Runna est une application de premier ordre pour son guidage audio et sa motivation sur tapis, mais sa progression d’allures très agressive et sa rigidité causent de nombreuses blessures (périostites, tendinites) dès que la fatigue s’accumule. L’alternative idéale est SharpIt : au lieu d’imposer des chronos théoriques, SharpIt analyse chaque matin votre nuit et votre variabilité cardiaque (VFC) via votre montre pour proposer d’alléger, de maintenir ou d’ajuster votre séance. Si vous ratez un entraînement, le plan se réorganise automatiquement sous la protection de 13 garde-fous physiologiques.',
    honestCompetitorStrengths: [
      'Guidage audio dynamique d’excellente qualité pour les séances de fractionné.',
      'Plans adaptés pour le tapis de course (treadmill workouts).',
      'Forte communauté anglophone et interface visuellement réussie.',
    ],
    complaintsFromRunners: [
      'Allures cibles trop rapides basées sur des records passés, menant à l’épuisement.',
      'Trop de séances dures programmées chaque semaine sans filet de sécurité.',
      'Culpabilité et anxiété de complétion lorsqu’une séance est manquée par manque de temps.',
      'Tarif d’abonnement élevé (environ 18 $/mois ou 120 $/an).',
    ],
    sharpitSolution:
      'SharpIt protège votre corps grâce à 13 garde-fous stricts (pas plus de 2 à 3 séances intenses par semaine, espacées d’au moins 24 heures). Chaque matin, la proposition du matin adapte la séance du jour selon votre sommeil et votre VFC réelle, et le bouton « Rattraper ma semaine » répare vos séances manquées sans stress.',
    comparisonRows: [
      {
        feature: 'Gestion d’une séance manquée',
        sharpit: 'Auto-réparation en 1 clic (« Rattraper ma semaine »)',
        competitor: 'Décalage manuel ou séance perdue',
        winner: 'sharpit',
      },
      {
        feature: 'Adaptation quotidienne à la forme',
        sharpit: 'Proposition du matin (Alléger / Garder / Augmenter)',
        competitor: 'Allures figées à l’avance',
        winner: 'sharpit',
      },
      {
        feature: 'Garde-fous anti-blessure',
        sharpit: '13 règles physiologiques strictes',
        competitor: 'Progression algorithmique agressive',
        winner: 'sharpit',
      },
      {
        feature: 'Synchronisation Garmin',
        sharpit: 'Bi-directionnelle native complète',
        competitor: 'Envoi des séances structurées',
        winner: 'draw',
      },
      {
        feature: 'Guidage vocal audio immersif',
        sharpit: 'Guidage sur montre connectée',
        competitor: 'Cues audio riches dans les écouteurs',
        winner: 'competitor',
      },
      {
        feature: 'Transparence des décisions',
        sharpit: 'Explications claires pour chaque ajustement',
        competitor: 'Algorithme boîte noire',
        winner: 'sharpit',
      },
    ],
    faq: [
      {
        question: 'Pourquoi changer de Runna pour SharpIt ?',
        answer:
          'Si vous avez déjà ressenti des débuts de périostite, une fatigue chronique ou la frustration de ne pas pouvoir décaler une séance sans casser votre plan, SharpIt est pensé pour vous. SharpIt place la récupération et la flexibilité de vie au centre de la préparation.',
      },
      {
        question: 'Comment SharpIt évite-t-il les blessures ?',
        answer:
          'SharpIt intègre 13 contrôles automatiques avant d’afficher toute séance : espacement obligatoire de 24h entre séances intenses, limitation de la charge hebdomadaire, et allègement immédiat si votre sommeil ou votre niveau de récupération cardiaque est insuffisant.',
      },
      {
        question: 'Mes séances SharpIt vont-elles sur ma montre Garmin ?',
        answer:
          'Oui. SharpIt se synchronise directement avec Garmin Connect pour lire vos nuits et exporter vos séances d’entraînement avec leurs allures et cibles précises directement sur votre montre.',
      },
    ],
  },
  'campus-coach': {
    slug: 'campus-coach',
    name: 'Campus Coach',
    metaTitle: 'Alternative à Campus Coach : le plan running véritablement adaptatif',
    metaDescription:
      'Vous trouvez les plans Campus Coach trop rigides en cas de fatigue ou d’imprévu ? Découvrez SharpIt, le coach d’endurance qui répare votre semaine selon votre forme réelle.',
    h1: 'Vous cherchez une alternative à Campus Coach ? Découvrez l’approche adaptative de SharpIt',
    tagline: 'Le plan qui s’adapte à votre vraie vie, pas l’inverse.',
    directAnswer:
      'Campus Coach est une plateforme reconnue pour sa rigueur méthodologique et ses allures cibles, mais son architecture reste peu réactive aux imprévus du quotidien et peut s’avérer trop exigeante lors d’une reprise ou d’un coup de fatigue. SharpIt est l’alternative conçue pour les coureurs au planning chargé : chaque matin, une proposition intelligente adapte la séance du jour selon vos mesures de sommeil et de récupération Garmin réelles. Si vous manquez un entraînement, la commande « Rattraper ma semaine » réorganise la suite de votre semaine en un clic sans surcharge.',
    honestCompetitorStrengths: [
      'Pédagogie remarquable issue de la communauté Running Addict.',
      'Séances variées avec calcul précis des allures selon votre chrono de référence.',
      'Excellente communauté francophone et entraide entre coureurs.',
    ],
    complaintsFromRunners: [
      'Manque de souplesse lorsque des contraintes personnelles ou professionnelles obligent à décaler.',
      'Allures parfois trop soutenues lors des séances de fractionné pour les profils en reprise.',
      'Absence de modulation dynamique basée sur le sommeil et la variabilité cardiaque quotidienne.',
      'Interface parfois dense demandant une gestion manuelle de son calendrier.',
    ],
    sharpitSolution:
      'SharpIt ne vous demande pas de réorganiser manuellement vos blocs de séances. Dès qu’une séance est manquée, le coach vous propose une solution équilibrée en préservant les séances clés. Et chaque matin au réveil, SharpIt relit votre état réel et vous propose d’alléger la séance si votre corps en a besoin.',
    comparisonRows: [
      {
        feature: 'Réorganisation après imprévu',
        sharpit: 'Automatique avec arbitrage séances clés vs secondaires',
        competitor: 'Ajustement manuel dans le calendrier',
        winner: 'sharpit',
      },
      {
        feature: 'Lecture du sommeil et de la VFC',
        sharpit: 'Oui, analyse quotidienne chaque matin à 7h',
        competitor: 'Non, plan basé sur la vitesse théorique',
        winner: 'sharpit',
      },
      {
        feature: 'Calcul des allures cibles',
        sharpit: 'Plages d’intensité adaptées à la forme du jour',
        competitor: 'Allures fixes déterminées au départ',
        winner: 'draw',
      },
      {
        feature: 'Préparation multi-sports (Triathlon)',
        sharpit: 'Course, vélo, natation intégrés nativement',
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
          'Là où Campus Coach vous fournit une feuille de route prévisionnelle, SharpIt agit comme un copilote matinal : il vérifie votre disponibilité physiologique chaque matin et répare le plan dès qu’une séance saute.',
      },
      {
        question: 'Puis-je préparer un semi-marathon ou un marathon avec SharpIt ?',
        answer:
          'Absolument. SharpIt structure votre montée en charge sur 8 à 16 semaines, identifie 2 à 3 séances clés par semaine et protège vos sorties longues contre la fatigue excessive.',
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
