import { isSet } from '@sharpit/shared/value';
/**
 * Shape of a strength / prehab session: how many exercises a duration actually
 * holds, and which blocks must be present.
 *
 * A joint-prevention session is not three exercises: it walks the whole chain
 * around the joint (agonists, antagonists, stabilisers, single-leg work) after
 * an activation block and before core and stretching. Prompts state the rule,
 * this module makes it checkable.
 */
import type {
  CoachStrengthPrescription,
  StrengthPrescription,
} from '@sharpit/app/lib/planned-session/strength/strength-prescription';

export type StrengthBlockRole = 'ACTIVATION' | 'PREHAB' | 'STRENGTH' | 'CORE' | 'STRETCH';

export type StrengthBlock = {
  role: StrengthBlockRole;
  label: string;
  /** Share of the session's exercises, before the per-block minimum applies. */
  share: number;
  minExercises: number;
  guidance: string;
};

/** Ordered — this is the order the athlete performs them in. */
export const STRENGTH_BLOCKS: readonly StrengthBlock[] = [
  {
    role: 'ACTIVATION',
    label: 'Mobilité / activation',
    share: 0.2,
    minExercises: 2,
    guidance: 'Mobilité articulaire et activation des muscles ciblés, avant toute charge.',
  },
  {
    role: 'PREHAB',
    label: 'Renfo ciblé',
    share: 0.35,
    minExercises: 3,
    guidance:
      'Avec une zone sensible déclarée : toute la chaîne autour de l’articulation (agonistes, antagonistes, stabilisateurs, au moins un exercice unilatéral). Sans zone sensible : tendons et accessoires du sport (isométrie lourde puis excentrique lent) et progressions au service de l’objectif.',
  },
  {
    role: 'STRENGTH',
    label: 'Force / charge',
    share: 0.2,
    minExercises: 2,
    guidance: 'Mouvements globaux chargés (ou tempo lent au poids du corps) pour la force.',
  },
  {
    role: 'CORE',
    label: 'Gainage',
    share: 0.1,
    minExercises: 1,
    guidance: 'Gainage antéro-latéral et anti-rotation, en isométrie chronométrée.',
  },
  {
    role: 'STRETCH',
    label: 'Étirements',
    share: 0.15,
    minExercises: 2,
    guidance: 'Étirements des zones travaillées, tenus 30 à 60 s.',
  },
];

/** Empirical: one exercise block (≈3 sets + rest + transition) fills this much. */
const MINUTES_PER_EXERCISE = 4;
/**
 * Below this the block minima no longer fit the exercise budget: the session is a
 * short mobility filler, not a structured one.
 */
const MIN_STRUCTURED_MINUTES = 35;

/**
 * Structured strength sessions an endurance athlete should get per week. Two is
 * the dose the tendon and running-economy evidence rests on (Rønnestad & Mujika
 * 2014, Beyer et al. 2015); one keeps the adaptation through a light week.
 */
export const WEEKLY_STRENGTH_TARGET = 2;
export const LIGHT_WEEK_STRENGTH_TARGET = 1;

/** A short mobility filler is not renfo: only a structured session counts toward the weekly dose. */
export function isStructuredStrengthSession(durationMin: number | null | undefined): boolean {
  return isSet(durationMin) && durationMin >= MIN_STRUCTURED_MINUTES;
}
const DEFAULT_SESSION_MINUTES = 45;

/** Rep cadence used to estimate work time when no duration is prescribed. */
const SECONDS_PER_REP = 3;
/** Lap rest is athlete-driven; this is the planning assumption for it. */
const DEFAULT_LAP_REST_SEC = 45;
/** Setup / material change between two exercises. */
const TRANSITION_SEC = 30;

export type StrengthSessionShape = {
  durationMin: number;
  /** Exercise count the duration supports. */
  minExercises: number;
  maxExercises: number;
  /** Blocks to cover — empty for a session too short to structure. */
  blocks: Array<StrengthBlock & { targetExercises: number }>;
};

/** Exercise budget and block breakdown for a session of this length. */
export function planStrengthSessionShape(
  durationMin: number | null | undefined,
): StrengthSessionShape {
  const minutes = isSet(durationMin) && durationMin > 0 ? durationMin : DEFAULT_SESSION_MINUTES;
  const target = Math.round(minutes / MINUTES_PER_EXERCISE);
  const minExercises = Math.max(3, target - 2);
  const maxExercises = Math.max(minExercises, target + 2);

  if (minutes < MIN_STRUCTURED_MINUTES) {
    return { durationMin: minutes, minExercises, maxExercises, blocks: [] };
  }

  return {
    durationMin: minutes,
    minExercises,
    maxExercises,
    blocks: STRENGTH_BLOCKS.map((block) => ({
      ...block,
      targetExercises: Math.max(block.minExercises, Math.round(target * block.share)),
    })),
  };
}

type EstimatableSet = {
  sets: number;
  reps: number;
  durationSec?: number | null;
  restSec?: number | null;
  restMode?: string | null;
};

function setSeconds(set: EstimatableSet): number {
  const workSec =
    isSet(set.durationSec) && set.durationSec > 0
      ? set.durationSec
      : Math.max(1, set.reps) * SECONDS_PER_REP;
  const restSec =
    set.restMode === 'time' && isSet(set.restSec) && set.restSec > 0
      ? set.restSec
      : DEFAULT_LAP_REST_SEC;
  return Math.max(1, set.sets) * (workSec + restSec) + TRANSITION_SEC;
}

/** Rough wall-clock length of a prescription, in minutes. */
export function estimateStrengthPrescriptionMinutes(sets: readonly EstimatableSet[]): number {
  const seconds = sets.reduce((total, set) => total + setSeconds(set), 0);
  return Math.round(seconds / 60);
}

export type StrengthPrescriptionAudit = {
  exerciseCount: number;
  estimatedMin: number;
  targetMin: number;
  minExercises: number;
  maxExercises: number;
  verdict: 'ok' | 'too_short' | 'too_long';
  message: string;
};

/** Prescription is this far off the planned duration before it is worth flagging. */
const SHORT_RATIO = 0.75;
const LONG_RATIO = 1.3;

/**
 * Compare a prescription against the session duration it is meant to fill.
 * Returned to the coach after every STRENGTH write so an under-filled session
 * gets completed instead of shipping as "20 minutes, 4 exercices".
 */
export function auditStrengthPrescription(input: {
  durationMin: number | null | undefined;
  prescription: StrengthPrescription | CoachStrengthPrescription | null | undefined;
}): StrengthPrescriptionAudit | null {
  const sets = input.prescription?.sets;
  if (!sets || sets.length === 0) {
    return null;
  }

  const shape = planStrengthSessionShape(input.durationMin);
  const estimatedMin = estimateStrengthPrescriptionMinutes(sets);
  const exerciseCount = sets.length;

  const base = {
    exerciseCount,
    estimatedMin,
    targetMin: shape.durationMin,
    minExercises: shape.minExercises,
    maxExercises: shape.maxExercises,
  };

  if (estimatedMin < shape.durationMin * SHORT_RATIO || exerciseCount < shape.minExercises) {
    return {
      ...base,
      verdict: 'too_short',
      message: `Séance sous-remplie : ${exerciseCount} exercices ≈ ${estimatedMin} min pour ${shape.durationMin} min prévues. Complète jusqu'à ${shape.minExercises}-${shape.maxExercises} exercices en couvrant les blocs (mobilité, renfo articulaire, force, gainage, étirements).`,
    };
  }

  if (estimatedMin > shape.durationMin * LONG_RATIO) {
    return {
      ...base,
      verdict: 'too_long',
      message: `Séance trop longue : ${exerciseCount} exercices ≈ ${estimatedMin} min pour ${shape.durationMin} min prévues. Retire des exercices ou baisse le volume.`,
    };
  }

  return {
    ...base,
    verdict: 'ok',
    message: `${exerciseCount} exercices ≈ ${estimatedMin} min, cohérent avec ${shape.durationMin} min prévues.`,
  };
}

/** Weekly strength dose rule, shared by the plan generator and the chat coach. */
export function formatStrengthFrequencyRule(): string {
  return `- Renfo préventif (impératif dès qu'un sport d'endurance est pratiqué, que le renfo soit coché ou non) : ${WEEKLY_STRENGTH_TARGET} séances STRENGTH structurées (≥ ${MIN_STRUCTURED_MINUTES} min) par semaine, ${LIGHT_WEEK_STRENGTH_TARGET} seule en semaine de récupération, d'affûtage ou de course, aucune sous contrainte voyage MOBILITY_ONLY/NONE ou capacité REST_ONLY. Une mobilité courte ne compte pas comme renfo. Chaque séance charge les tendons du sport, avec une progression d'une semaine à l'autre : mollets/Achille, rotulien et ischios pour la course ; quadriceps, fessiers et lombaires pour le vélo ; coiffe des rotateurs et omoplates pour la natation. Place-la après une séance facile, ou le soir d'une séance dure (≥ 6 h après), jamais la veille d'une séance clé ; 48 h entre deux séances sur les mêmes muscles.`;
}

/** Compact FR rules block injected in coach prompts. */
export function formatStrengthSessionRules(): string {
  const blocks = STRENGTH_BLOCKS.map((block) => `${block.label} (${block.guidance})`).join(' · ');
  return [
    '## Séances STRENGTH (renfo / prévention)',
    `- Structure obligatoire, dans cet ordre : ${blocks}`,
    "- Chaque exercice sert l'objectif déclaré. Pour un objectif de force ou de skill (muscle-up, traction, squat, handstand…), la force et les progressions spécifiques de ce geste sont le cœur de la séance ; la mobilité et les étirements visent les articulations qu'il sollicite.",
    "- Le nombre d'exercices suit durationMin (~1 exercice par 4 min) : 30 min ≈ 6-10, 45 min ≈ 9-13, 60 min ≈ 13-17. Une séance de 3 à 5 exercices au-delà de 20 min est un échec.",
    "- Prévention articulaire, seulement pour une zone sensible déclarée dans le contexte : couvre toute la chaîne autour (agonistes, antagonistes, stabilisateurs), avec du travail unilatéral et au moins un exercice excentrique. Sans zone sensible, n'invente pas de pathologie : le travail tendineux du sport reste la base.",
    '- Libellés FR proches du catalogue Garmin Connect — vérifie avec searchWatchExercises quand tu hésites, sinon la montre affichera un nom générique.',
    "- Pour CHAQUE exercice, déclare intent et pattern : c'est ce qui permet de vérifier qu'un étirement n'est pas compté comme une mise en charge, et qu'aucune zone sensible n'est chargée. Un étirement ou un auto-massage est intent=MOBILITY, pattern=null.",
  ].join('\n');
}
