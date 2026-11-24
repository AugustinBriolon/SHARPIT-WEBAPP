import type { SessionIntensity } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import {
  shapeStrengthSet,
  type StrengthPrescription,
} from '@sharpit/app/lib/planned-session/strength/strength-prescription';

/**
 * How hard a strength session is at each intensity, relative to its top: the load lifted and the
 * number of sets. A session moved from one intensity to another keeps its exercises and reps and
 * scales these two by the ratio — a recovery circuit pushed to endurance gets heavier and longer,
 * not only a new word on top.
 */
const STRENGTH_PROFILE: Record<SessionIntensity, { load: number; sets: number }> = {
  RECOVERY: { load: 0.6, sets: 0.7 },
  ENDURANCE: { load: 0.75, sets: 0.85 },
  TEMPO: { load: 0.85, sets: 1 },
  THRESHOLD: { load: 0.92, sets: 1 },
  VO2MAX: { load: 1, sets: 1 },
  RACE: { load: 1, sets: 1 },
};

const MAX_SETS = 10;

/** Plates come in 0.5 kg steps at the smallest. */
function roundLoad(kg: number): number {
  return Math.max(0.5, Math.round(kg * 2) / 2);
}

/**
 * The same strength session at another intensity. Mobility holds and bodyweight moves keep their
 * shape (they carry no load and are not made harder by repetition); the rest scale sets and load.
 * Null when there is nothing to change.
 */
export function retargetStrengthPrescription(input: {
  prescription: StrengthPrescription;
  from: SessionIntensity | null;
  to: SessionIntensity | null;
}): StrengthPrescription | null {
  const { from, to } = input;
  if (!from || !to || from === to) {
    return null;
  }
  const loadRatio = STRENGTH_PROFILE[to].load / STRENGTH_PROFILE[from].load;
  const setsRatio = STRENGTH_PROFILE[to].sets / STRENGTH_PROFILE[from].sets;

  const sets = input.prescription.sets.map((set) => {
    const shaped = shapeStrengthSet(set);
    if (shaped.intent === 'MOBILITY') {
      return set;
    }
    return {
      ...set,
      sets: Math.min(MAX_SETS, Math.max(1, Math.round(set.sets * setsRatio))),
      weightKg: isSet(shaped.weightKg) ? roundLoad(shaped.weightKg * loadRatio) : set.weightKg,
    };
  });
  return { ...input.prescription, sets };
}

/** Every way a session's text names an intensity, longest first so « récup » never eats « récupération ». */
const INTENSITY_WORDS: Record<SessionIntensity, string[]> = {
  RECOVERY: ['récupération', 'recuperation', 'récup', 'recup', 'recovery'],
  ENDURANCE: ['endurance'],
  TEMPO: ['tempo'],
  THRESHOLD: ['seuil', 'threshold'],
  VO2MAX: ['vo2 max', 'vo2max'],
  RACE: ['compétition', 'competition'],
};

/** The word inside a sentence (« 15 min récup »), where the long label would read heavy. */
const INTENSITY_SHORT: Record<SessionIntensity, string> = {
  RECOVERY: 'récup',
  ENDURANCE: 'endurance',
  TEMPO: 'tempo',
  THRESHOLD: 'seuil',
  VO2MAX: 'VO2max',
  RACE: 'compétition',
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A session's title or free text with its old intensity named as the new one:
 * « Récupération 30min (10min échauffement - 15min recup - 5min retour au calme) » pushed to
 * endurance reads « Endurance 30min (10min échauffement - 15min endurance - 5min retour au calme) ».
 * The word that opens the text takes the full label, the others the short one. Text that never
 * names the old intensity — a name the athlete chose — comes back unchanged.
 */
export function renameIntensityInText(
  text: string | null,
  from: SessionIntensity | null,
  to: SessionIntensity | null,
): string | null {
  if (!text || !from || !to || from === to) {
    return text;
  }
  const words = INTENSITY_WORDS[from].map(escapeRegExp).join('|');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${words})(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(pattern, (_match, _word, offset: number) =>
    text.slice(0, offset).trim() === '' ? intensityLabels[to] : INTENSITY_SHORT[to],
  );
}
