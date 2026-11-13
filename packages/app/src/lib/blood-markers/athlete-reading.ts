/**
 * The athlete reading of a blood test (ADR-129): what a result means for someone who trains,
 * crossed with the sessions before the sample. Deterministic and sourced; it never decides that
 * something is fine or wrong, it says what the training can explain and when to retest or ask a
 * doctor. No model reads blood values (ADR-128).
 */
import { bloodMarkerStatus, type BloodMarkerKey, type BloodMarkerResult } from './catalog';

/** The training before the sample, counted by the server from the athlete's activities. */
export type TrainingBeforeSample = {
  /** Sessions in the 7 days before the sample. */
  sessionsInWeek: number;
  /** Strength sessions in the 7 days before the sample. */
  strengthInWeek: number;
  /** Sessions in the 28 days before the sample. */
  sessionsInFourWeeks: number;
};

export type AthleteFindingKey =
  | 'transaminases_after_training'
  | 'transaminases_without_training'
  | 'ferritin_low_for_athlete'
  | 'neutrophils_low_trained'
  | 'creatinine_muscle_mass';

export type AthleteFinding = {
  key: AthleteFindingKey;
  markerKeys: BloodMarkerKey[];
  /** `context`: training can explain it. `doctor`: worth showing to a doctor. */
  tone: 'context' | 'doctor';
  text: string;
  source: string;
};

const SOURCES = {
  transaminases:
    'Pettersson J. et al., Muscular exercise can cause highly pathological liver function tests in healthy men. Br J Clin Pharmacol 2008;65(2):253-259',
  ferritin:
    'Sim M. et al., Iron considerations for the athlete: a narrative review. Eur J Appl Physiol 2019;119:1463-1478',
  neutrophils:
    'Blannin A.K. et al., Effects of submaximal cycling and long-term endurance training on neutrophil phagocytic activity in middle aged men. Br J Sports Med 1996;30(2):125-129',
  creatinine:
    'Banfi G., Del Fabbro M., Lippi G., Serum creatinine concentration and creatinine-based estimation of glomerular filtration rate in athletes. Sports Med 2009;39(4):331-337',
} as const;

/** Stage 1 iron depletion in athletes (Sim 2019): above most labs' lower bound, on purpose. */
export const ATHLETE_FERRITIN_FLOOR = 35;
/** Regular training, for the neutrophil reading: about two sessions a week over four weeks. */
const REGULAR_SESSIONS_IN_FOUR_WEEKS = 8;
/** A drop this close to the lab's lower bound is called mild. */
const MILD_SHARE_OF_LOWER_BOUND = 0.8;

type Results = Partial<Record<BloodMarkerKey, BloodMarkerResult>>;

function byKey(results: readonly BloodMarkerResult[]): Results {
  return Object.fromEntries(results.map((result) => [result.markerKey, result]));
}

function isHigh(result: BloodMarkerResult | undefined): result is BloodMarkerResult {
  return result !== undefined && bloodMarkerStatus(result) === 'high';
}

function isLow(result: BloodMarkerResult | undefined): result is BloodMarkerResult {
  return result !== undefined && bloodMarkerStatus(result) === 'low';
}

function transaminases(results: Results, training: TrainingBeforeSample): AthleteFinding | null {
  const raised = (['ast', 'alt'] as const).filter((key) => isHigh(results[key]));
  if (raised.length === 0) {
    return null;
  }
  if (training.sessionsInWeek === 0) {
    return {
      key: 'transaminases_without_training',
      markerKeys: [...raised],
      tone: 'doctor',
      text: 'Transaminases au-dessus de l’intervalle sans séance enregistrée dans SHARPIT les 7 jours avant la prise de sang : rien ne permet de l’attribuer à l’entraînement. Montre ce résultat à ton médecin.',
      source: SOURCES.transaminases,
    };
  }
  const { ggt } = results;
  const ggtNote =
    ggt && bloodMarkerStatus(ggt) === 'in_range'
      ? ' Ta GGT est dans l’intervalle, ce qui va dans le sens d’une origine musculaire.'
      : '';
  const strength = training.strengthInWeek > 0 ? ', dont du renforcement,' : '';
  return {
    key: 'transaminases_after_training',
    markerKeys: [...raised],
    tone: 'context',
    text: `Transaminases au-dessus de l’intervalle avec ${training.sessionsInWeek} séance(s)${strength} dans les 7 jours avant la prise de sang. Un effort musculaire peut les élever pendant au moins 7 jours.${ggtNote} Une nouvelle prise de sang après une semaine sans séance dure permet de trancher.`,
    source: SOURCES.transaminases,
  };
}

function ferritin(results: Results): AthleteFinding | null {
  const value = results.ferritin?.value;
  if (value === undefined || value >= ATHLETE_FERRITIN_FLOOR) {
    return null;
  }
  const anaemia = isLow(results.hemoglobin);
  return {
    key: 'ferritin_low_for_athlete',
    markerKeys: anaemia ? ['ferritin', 'hemoglobin'] : ['ferritin'],
    tone: anaemia || isLow(results.ferritin) ? 'doctor' : 'context',
    text: anaemia
      ? `Ferritine sous ${ATHLETE_FERRITIN_FLOOR} µg/L avec une hémoglobine basse : un manque de fer peut peser sur l’endurance. Parles-en à ton médecin avant toute supplémentation.`
      : `Ferritine sous ${ATHLETE_FERRITIN_FLOOR} µg/L : pour un sportif d’endurance, c’est déjà un premier stade de réserves basses, même si le laboratoire la juge normale. À suivre, et à montrer à ton médecin avant toute supplémentation.`,
    source: SOURCES.ferritin,
  };
}

function neutrophils(results: Results, training: TrainingBeforeSample): AthleteFinding | null {
  const low = (['neutrophils', 'white_blood_cells'] as const).filter((key) => isLow(results[key]));
  if (low.length === 0) {
    return null;
  }
  const mild = low.every((key) => {
    const result = results[key];
    const refLow = result?.refLow ?? null;
    return (
      result !== undefined && refLow !== null && result.value >= refLow * MILD_SHARE_OF_LOWER_BOUND
    );
  });
  const trained = training.sessionsInFourWeeks >= REGULAR_SESSIONS_IN_FOUR_WEEKS;
  if (mild && trained) {
    return {
      key: 'neutrophils_low_trained',
      markerKeys: [...low],
      tone: 'context',
      text: 'Globules blancs un peu sous l’intervalle avec un entraînement régulier ce dernier mois : une légère baisse au repos est décrite chez les sportifs d’endurance. Elle se juge sur une seconde analyse, et avec ton médecin si elle se confirme.',
      source: SOURCES.neutrophils,
    };
  }
  return {
    key: 'neutrophils_low_trained',
    markerKeys: [...low],
    tone: 'doctor',
    text: mild
      ? 'Globules blancs un peu sous l’intervalle, sans entraînement régulier enregistré dans SHARPIT le mois d’avant : rien ne permet de l’attribuer à l’entraînement. Montre ce résultat à ton médecin.'
      : 'Globules blancs nettement sous l’intervalle : l’entraînement n’explique pas une baisse de cet ordre. Montre ce résultat à ton médecin.',
    source: SOURCES.neutrophils,
  };
}

function creatinine(results: Results): AthleteFinding | null {
  const high = isHigh(results.creatinine);
  const { egfr } = results;
  const egfrLow = egfr !== undefined && egfr.value < 90;
  if (!high && !egfrLow) {
    return null;
  }
  return {
    key: 'creatinine_muscle_mass',
    markerKeys: high ? ['creatinine'] : ['egfr'],
    tone: 'context',
    text: 'Chez un sportif, la créatinine suit la masse musculaire et l’effort récent, et le DFG calculé à partir d’elle est moins fiable. Compare-la à tes analyses précédentes faites au repos ; si l’écart persiste, ton médecin peut demander une cystatine C.',
    source: SOURCES.creatinine,
  };
}

/** Every finding the results and the training support, doctor-worthy ones first. */
export function athleteReading(
  results: readonly BloodMarkerResult[],
  training: TrainingBeforeSample,
): AthleteFinding[] {
  const indexed = byKey(results);
  return [
    transaminases(indexed, training),
    ferritin(indexed),
    neutrophils(indexed, training),
    creatinine(indexed),
  ]
    .filter((finding): finding is AthleteFinding => finding !== null)
    .sort((a, b) => Number(b.tone === 'doctor') - Number(a.tone === 'doctor'));
}
