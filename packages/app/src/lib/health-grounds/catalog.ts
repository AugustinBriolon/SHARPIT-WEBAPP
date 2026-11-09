/**
 * Health grounds (ADR-124): conditions with no single body zone that change how training is
 * built — bone, pregnancy, cycle, metabolism, breathing, heart, joints. Each has stages (where
 * the athlete is with it) and, per stage, the rules the coach applies. Every rule comes from the
 * source the entry names; nothing here is a diagnosis, and a stage that needs a medical
 * go-ahead caps intensity until the athlete says they have it.
 *
 * The iOS onboarding mirrors keys, labels and stages (SHARPIT-APP `HealthGroundCatalog`).
 */

export const HEALTH_GROUND_KEYS = [
  'osteoporosis',
  'pregnancy',
  'postpartum',
  'menstrual_cycle',
  'diabetes',
  'asthma',
  'cardiovascular',
  'osteoarthritis',
  'other',
] as const;

export type HealthGroundKey = (typeof HEALTH_GROUND_KEYS)[number];

export type HealthGroundStage = {
  id: string;
  label: string;
  /** What the plan does, written for the coach prompt. */
  rules: readonly string[];
  /** True when a doctor's (or midwife's) go-ahead is owed before vigorous work. */
  needsClearance?: boolean;
};

export type HealthGroundEntry = {
  key: HealthGroundKey;
  label: string;
  /** The « where are you » question the athlete answers. */
  question: string;
  stages: readonly HealthGroundStage[];
  source: string;
};

const CLEARANCE_RULE =
  'Avis médical à obtenir : pas d’intensité vigoureuse (au-delà de l’endurance fondamentale) tant que l’athlète ne l’a pas confirmé.';

export const HEALTH_GROUND_CATALOG: readonly HealthGroundEntry[] = [
  {
    key: 'osteoporosis',
    label: 'Ostéoporose / ostéopénie',
    question: 'Où en es-tu ?',
    source: 'Strong, steady and straight — UK consensus, Br J Sports Med 2022;56:837-846',
    stages: [
      {
        id: 'osteopenia',
        label: 'Ostéopénie (densité basse)',
        rules: [
          'Renforcement progressif 2 à 3 fois par semaine, charges qui montent.',
          'Impacts modérés à élevés bienvenus s’ils sont tolérés (sauts, course).',
          'Travail d’équilibre au moins 2 fois par semaine.',
        ],
      },
      {
        id: 'osteoporosis',
        label: 'Ostéoporose diagnostiquée',
        rules: [
          'Renforcement progressif 2 à 3 fois par semaine.',
          'Impacts introduits progressivement, sans sauts brusques.',
          'Éviter la flexion du dos chargée, répétée ou en fin d’amplitude (crunchs, soulevés dos rond).',
          'Travail d’équilibre et extension du dos chaque semaine.',
        ],
      },
      {
        id: 'vertebral_fracture',
        label: 'Avec fracture vertébrale',
        rules: [
          'Impact plafonné au niveau de la marche rapide : pas de course ni de sauts.',
          'Priorité à l’extension du dos et à la posture, puis renforcement léger.',
          'Aucune flexion du dos chargée.',
        ],
        needsClearance: true,
      },
    ],
  },
  {
    key: 'pregnancy',
    label: 'Grossesse',
    question: 'À quel trimestre ?',
    source: 'ACOG Committee Opinion 804 (2020): Physical activity and exercise during pregnancy',
    stages: [
      {
        id: 't1',
        label: '1er trimestre',
        rules: [
          'Intensité modérée, test de la parole (pouvoir parler en s’entraînant).',
          'Pas de sport de contact ni à risque de chute.',
        ],
        needsClearance: true,
      },
      {
        id: 't2',
        label: '2e trimestre',
        rules: [
          'Intensité modérée, test de la parole.',
          'Éviter de rester longtemps allongée sur le dos.',
          'Pas de sport de contact ni à risque de chute.',
        ],
        needsClearance: true,
      },
      {
        id: 't3',
        label: '3e trimestre',
        rules: [
          'Volume et intensité réduits, séances courtes.',
          'Éviter de rester longtemps allongée sur le dos.',
          'Pas d’impact si gêne pelvienne.',
        ],
        needsClearance: true,
      },
    ],
  },
  {
    key: 'postpartum',
    label: 'Post-partum',
    question: 'Depuis l’accouchement ?',
    source: 'Goom, Donnelly & Brockwell (2019), Returning to running postnatal',
    stages: [
      {
        id: 'under_6_weeks',
        label: 'Moins de 6 semaines',
        rules: ['Marche et respiration, périnée en douceur. Pas de course ni d’impact.'],
        needsClearance: true,
      },
      {
        id: '6_to_12_weeks',
        label: '6 à 12 semaines',
        rules: [
          'Faible impact (vélo, natation si cicatrisation faite), renforcement du périnée et du tronc.',
          'Pas de course avant 12 semaines.',
        ],
        needsClearance: true,
      },
      {
        id: 'over_12_weeks',
        label: 'Plus de 12 semaines',
        rules: [
          'Reprise de la course progressive (alternance marche-course) si aucune fuite, lourdeur ou douleur pelvienne.',
          'Renforcement du périnée maintenu.',
        ],
      },
    ],
  },
  {
    key: 'menstrual_cycle',
    label: 'Cycle menstruel',
    question: 'Comment est ton cycle ?',
    source:
      'McNulty et al. (2020), Sports Med 50:1813-1827 — phase effects trivial, individual approach',
    stages: [
      {
        id: 'regular',
        label: 'Régulier, sans gêne',
        rules: ['Aucune règle par phase : le plan ne bouge pas selon le cycle.'],
      },
      {
        id: 'regular_symptoms',
        label: 'Régulier, avec symptômes',
        rules: [
          'Pas de plan par phase ; adapter au jour le jour selon les symptômes notés dans le journal (douleurs, fatigue, rétention d’eau).',
          'Les jours de règles gênants, proposer une séance plus douce plutôt qu’une séance clé.',
        ],
      },
      {
        id: 'irregular',
        label: 'Irrégulier ou absent',
        rules: [
          'Ne pas augmenter la charge : un cycle absent ou irrégulier peut signaler un déficit énergétique (RED-S).',
          'Recommander un avis médical et surveiller l’apport énergétique.',
        ],
        needsClearance: true,
      },
    ],
  },
  {
    key: 'diabetes',
    label: 'Diabète',
    question: 'Où en es-tu ?',
    source: 'Riddell et al. (2017), Lancet Diabetes Endocrinol 5:377-390',
    stages: [
      {
        id: 'type1_stable',
        label: 'Type 1, équilibré',
        rules: [
          'Rappeler de contrôler la glycémie avant, pendant (séance > 1 h) et après.',
          'Glucides rapides toujours à portée ; pas d’intensité élevée à jeun.',
          'Séances longues : prévoir un apport glucidique.',
        ],
      },
      {
        id: 'type2_stable',
        label: 'Type 2, équilibré',
        rules: [
          'Régularité prioritaire : activité la plupart des jours, renforcement 2 fois par semaine.',
          'Contrôler la glycémie autour des séances si traitement hypoglycémiant.',
        ],
      },
      {
        id: 'recent_hypos',
        label: 'Hypoglycémies récentes ou équilibre instable',
        rules: [
          'Intensité modérée seulement, séances courtes, glycémie contrôlée avant chaque séance.',
        ],
        needsClearance: true,
      },
    ],
  },
  {
    key: 'asthma',
    label: 'Asthme',
    question: 'Ton asthme est-il contrôlé ?',
    source: 'Parsons et al. (2013), ATS guideline: exercise-induced bronchoconstriction',
    stages: [
      {
        id: 'controlled',
        label: 'Contrôlé',
        rules: [
          'Échauffement long et progressif (15 min) avant toute intensité.',
          'Par temps froid et sec, déplacer les séances intenses en intérieur ou les adoucir.',
        ],
      },
      {
        id: 'uncontrolled',
        label: 'Pas bien contrôlé',
        rules: [
          'Endurance fondamentale seulement, échauffement long.',
          'Pas d’effort intense par temps froid et sec.',
        ],
        needsClearance: true,
      },
    ],
  },
  {
    key: 'cardiovascular',
    label: 'Tension ou cœur',
    question: 'Où en es-tu ?',
    source: 'PAR-Q+ (Warburton et al., Health Fit J Can 2011) and ACSM preparticipation screening',
    stages: [
      {
        id: 'cleared',
        label: 'Suivi et feu vert du médecin',
        rules: [
          'Progression prudente de l’intensité ; éviter les blocs à très haute intensité sans échauffement long.',
        ],
      },
      {
        id: 'not_cleared',
        label: 'Pas encore d’avis médical',
        rules: ['Intensité modérée seulement (test de la parole).'],
        needsClearance: true,
      },
    ],
  },
  {
    key: 'osteoarthritis',
    label: 'Arthrose',
    question: 'Quelle gêne au quotidien ?',
    source:
      'Kolasinski et al. (2020), ACR/Arthritis Foundation guideline for hand, hip and knee OA',
    stages: [
      {
        id: 'mild',
        label: 'Légère',
        rules: [
          'Renforcement des muscles autour de l’articulation 2 fois par semaine.',
          'Impact toléré si la douleur reste stable le lendemain.',
        ],
      },
      {
        id: 'moderate',
        label: 'Modérée',
        rules: [
          'Préférer le faible impact (vélo, natation, marche) ; renforcement régulier.',
          'Douleur jusqu’à 5/10 acceptable si elle revient au niveau de base sous 24 h.',
        ],
      },
      {
        id: 'severe',
        label: 'Forte',
        rules: ['Faible impact uniquement, volumes courts, renforcement doux.'],
        needsClearance: true,
      },
    ],
  },
  {
    key: 'other',
    label: 'Autre',
    question: 'Précise en quelques mots',
    source: 'Athlete-declared',
    stages: [
      {
        id: 'declared',
        label: 'Déclaré',
        rules: ['Tenir compte de ce que l’athlète a écrit ; en cas de doute, rester modéré.'],
      },
    ],
  },
];

export function healthGroundEntry(key: string): HealthGroundEntry | undefined {
  return HEALTH_GROUND_CATALOG.find((entry) => entry.key === key);
}

export function healthGroundStage(key: string, stage: string): HealthGroundStage | undefined {
  return healthGroundEntry(key)?.stages.find((candidate) => candidate.id === stage);
}

export type DeclaredHealthGround = { key: string; stage: string; details?: string | null };

/**
 * The coach's lines for the declared grounds; unknown keys or stages are dropped, never guessed.
 * `details` is athlete-written: the server wraps it as athlete text before it lands here.
 */
export function formatHealthGroundsForCoach(grounds: readonly DeclaredHealthGround[]): string[] {
  const lines: string[] = [];
  let clearanceOwed = false;
  for (const ground of grounds) {
    const entry = healthGroundEntry(ground.key);
    const stage = healthGroundStage(ground.key, ground.stage);
    if (!entry || !stage) {
      continue;
    }
    const details = ground.details?.trim() ? ` — ${ground.details.trim()}` : '';
    lines.push(`${entry.label} (${stage.label})${details} :`);
    lines.push(...stage.rules.map((rule) => `- ${rule}`));
    clearanceOwed ||= stage.needsClearance === true;
  }
  if (clearanceOwed) {
    lines.push(CLEARANCE_RULE);
  }
  return lines;
}
