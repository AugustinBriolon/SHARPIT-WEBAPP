import type {
  BikeEffort,
  PowerCurvePoint,
  RunBestCategory,
  RunEffort,
} from '@sharpit/app/lib/training/records/record-types';

/**
 * Prédiction de performance & estimation des seuils à partir des records déjà
 * calculés (meilleurs temps de course, courbe de puissance).
 *
 * Tout est déterministe et pur (aucune IA, aucune base) : on extrapole les
 * meilleurs efforts réels via la formule de Riegel pour la course, et on dérive
 * la FTP / l'allure seuil depuis les meilleurs efforts soutenus.
 */

/** Exposant de la loi d'endurance de Riegel : T2 = T1 · (D2/D1)^1.06. */
export const RIEGEL_EXPONENT = 1.06;

/** Distances cibles standard pour les prédictions de course (mètres). */
const RACE_TARGETS: { meters: number; label: string }[] = [
  { meters: 5000, label: '5 km' },
  { meters: 10000, label: '10 km' },
  { meters: 21097, label: 'Semi' },
  { meters: 42195, label: 'Marathon' },
];

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtPaceSecPerKm(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

interface RunReference {
  meters: number;
  seconds: number;
  label: string;
}

function runDistanceLabel(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/** Niveau de confiance selon l'écart entre la distance de référence et la cible. */
export type PredictionConfidence = 'high' | 'medium' | 'low';

export interface RunPrediction {
  meters: number;
  label: string;
  seconds: number;
  displayTime: string;
  paceSecPerKm: number;
  pace: string;
  referenceLabel: string;
  confidence: PredictionConfidence;
}

/** Defaults for creating a RACE goal from a run time prediction. */
export interface RaceGoalDefaultsFromPrediction {
  title: string;
  kind: 'RACE';
  raceFormat: string;
  targetPerformance: string;
  notes: string;
  priority: 'B';
}

/** Map a projected race time into prefilled RACE goal fields (date left to the athlete). */
export function predictionToRaceGoalDefaults(
  prediction: RunPrediction,
): RaceGoalDefaultsFromPrediction {
  return {
    title: `${prediction.label} · ${prediction.displayTime}`,
    kind: 'RACE',
    raceFormat: prediction.label,
    targetPerformance: prediction.displayTime,
    notes: `Projection SharpIt · ${prediction.pace} · base ${prediction.referenceLabel}`,
    priority: 'B',
  };
}

/**
 * Construit l'ensemble des références d'effort réel :
 * - segments glissants précis issus des streams (quand dispo)
 * - efforts d'activité entière (distance + temps) issus des métriques
 *
 * Les efforts métriques couvrent tout l'historique, pas seulement les rares
 * activités avec trace GPS — c'est ce qui rend les prédictions fiables.
 */
/** Every usable reference, sorted by distance and not yet deduped. */
function gatherRunReferences(runBests: RunBestCategory[], runEfforts: RunEffort[]): RunReference[] {
  const refs: RunReference[] = [];

  for (const cat of runBests) {
    const [best] = cat.entries;
    if (best && best.value > 0) {
      refs.push({ meters: cat.meters, seconds: best.value, label: cat.label });
    }
  }

  for (const e of runEfforts) {
    if (e.meters > 0 && e.seconds > 0) {
      refs.push({ meters: e.meters, seconds: e.seconds, label: runDistanceLabel(e.meters) });
    }
  }

  refs.sort((a, b) => a.meters - b.meters);
  return refs;
}

/**
 * À distance proche (±15 %), on ne garde que l'effort le plus rapide.
 * Évite qu'un segment GPS lent (ex. 5 km dans un footing) masque un vrai 5 km.
 *
 * À n'appliquer qu'entre références comparables : dédupliquer avant de filtrer
 * sur une bande de distance laisse une référence hors bande en éliminer une
 * dans la bande, et l'estimation retombe alors sur un effort bien plus lent.
 */
function dedupeRunReferences(refs: RunReference[]): RunReference[] {
  const deduped: RunReference[] = [];
  for (const ref of refs) {
    const last = deduped[deduped.length - 1];
    if (last && ref.meters <= last.meters * 1.15) {
      if (ref.seconds / ref.meters < last.seconds / last.meters) {
        deduped[deduped.length - 1] = ref;
      }
    } else {
      deduped.push(ref);
    }
  }

  return deduped;
}

function collectRunReferences(
  runBests: RunBestCategory[],
  runEfforts: RunEffort[],
): RunReference[] {
  return dedupeRunReferences(gatherRunReferences(runBests, runEfforts));
}

/**
 * Choisit la meilleure référence pour extrapoler vers la distance cible.
 * On ne garde que les efforts dans une bande de distance autour de la cible
 * (0,7×–3×) pour limiter l'erreur d'extrapolation, puis on retient celui
 * dont la distance est la plus proche (échelle log). Hors bande, on extrapole
 * depuis l'effort le plus long disponible.
 */
function bestReferenceFor(
  refs: RunReference[],
  target: number,
): { ref: RunReference; seconds: number } | null {
  if (refs.length === 0) {
    return null;
  }

  const band = refs.filter((r) => r.meters >= 0.7 * target && r.meters <= 3 * target);
  const pool = band.length > 0 ? band : [refs[refs.length - 1]];

  const ref = pool.reduce((best, cur) =>
    Math.abs(Math.log(cur.meters / target)) < Math.abs(Math.log(best.meters / target)) ? cur : best,
  );

  const seconds = ref.seconds * (target / ref.meters) ** RIEGEL_EXPONENT;
  return { ref, seconds };
}

function confidenceFromRatio(ratio: number): PredictionConfidence {
  const r = ratio >= 1 ? ratio : 1 / ratio;
  if (r <= 1.6) {
    return 'high';
  }
  if (r <= 3) {
    return 'medium';
  }
  return 'low';
}

/**
 * Prédit les temps de course sur les distances standard à partir des meilleurs
 * efforts réels (streams + métriques d'activité), via la loi de Riegel.
 */
export function predictRunRaces(
  runBests: RunBestCategory[],
  runEfforts: RunEffort[] = [],
): RunPrediction[] {
  const refs = collectRunReferences(runBests, runEfforts);
  if (refs.length === 0) {
    return [];
  }

  return RACE_TARGETS.map(({ meters, label }) => {
    const picked = bestReferenceFor(refs, meters)!;
    const { seconds } = picked;
    const paceSecPerKm = (seconds / meters) * 1000;

    return {
      meters,
      label,
      seconds: Math.round(seconds),
      displayTime: fmtTime(seconds),
      paceSecPerKm: Math.round(paceSecPerKm),
      pace: fmtPaceSecPerKm(paceSecPerKm),
      referenceLabel: picked.ref.label,
      confidence: confidenceFromRatio(meters / picked.ref.meters),
    };
  });
}

/** Distance proxy d'un effort ~1 h, représentative de l'allure seuil. */
const THRESHOLD_PROXY_METERS = 15000;

/**
 * Allure seuil estimée (s/km) ≈ allure soutenable ~1 h.
 * On prédit le temps sur ~15 km (effort d'environ 1 h pour un coureur entraîné)
 * à partir des meilleurs efforts réels, puis on en déduit l'allure. Bien plus
 * stable que d'extrapoler depuis un unique segment GPS.
 */
export function estimateRunThresholdPace(
  runBests: RunBestCategory[],
  runEfforts: RunEffort[] = [],
): number | null {
  const refs = gatherRunReferences(runBests, runEfforts);
  if (refs.length === 0) {
    return null;
  }

  // Pour l'allure seuil, on cherche l'enveloppe de performance démontrée autour
  // d'un effort ~1 h, pas l'effort de distance la plus proche. Sinon un long run
  // d'endurance ~15 km peut "écraser" un vrai niveau seuil/compétition.
  //
  // La bande est appliquée avant la déduplication : un 10 km rapide ne doit pas
  // éliminer un 11 km légèrement plus lent qui, lui, est dans la bande — sinon
  // il ne reste que les longues sorties lentes.
  const pool = dedupeRunReferences(
    refs.filter(
      (r) => r.meters >= 0.7 * THRESHOLD_PROXY_METERS && r.meters <= 3 * THRESHOLD_PROXY_METERS,
    ),
  );
  const candidates = pool.length > 0 ? pool : [dedupeRunReferences(refs).slice(-1)[0]];

  let bestPace: number | null = null;
  for (const ref of candidates) {
    const predictedSeconds = ref.seconds * (THRESHOLD_PROXY_METERS / ref.meters) ** RIEGEL_EXPONENT;
    const predictedPace = Math.round((predictedSeconds / THRESHOLD_PROXY_METERS) * 1000);
    if (bestPace === undefined || bestPace === null || predictedPace < bestPace) {
      bestPace = predictedPace;
    }
  }

  return bestPace;
}

export interface FtpEstimate {
  watts: number;
  source: string;
}

/** Facteur appliqué au meilleur effort d'une durée pour estimer la FTP. */
const FTP_FACTORS: { seconds: number; factor: number; label: string }[] = [
  { seconds: 3600, factor: 0.97, label: 'meilleur 60 min' },
  { seconds: 1800, factor: 0.95, label: 'meilleur 30 min' },
  { seconds: 1200, factor: 0.95, label: 'meilleur 20 min' },
  { seconds: 600, factor: 0.9, label: 'meilleur 10 min' },
];

/** Estime la FTP depuis la courbe de puissance (streams, source précise). */
function ftpFromPowerCurve(powerCurve: PowerCurvePoint[]): FtpEstimate | null {
  const byDuration = new Map(powerCurve.map((p) => [p.seconds, p.watts]));
  for (const { seconds, factor, label } of FTP_FACTORS) {
    const watts = byDuration.get(seconds);
    if (watts && watts > 0) {
      return { watts: Math.round(watts * factor), source: label };
    }
  }
  return null;
}

/** Facteur appliqué à la puissance normalisée d'un ride entier selon sa durée. */
function rideFtpFactor(seconds: number): number | null {
  if (seconds >= 3600) {
    return 0.97;
  }
  if (seconds >= 2400) {
    return 0.94;
  }
  if (seconds >= 1800) {
    return 0.92;
  }
  if (seconds >= 1200) {
    return 0.9;
  }
  return null;
}

/** Estime la FTP depuis la NP des rides entiers (couvre tout l'historique). */
function ftpFromBikeEfforts(bikeEfforts: BikeEffort[]): FtpEstimate | null {
  let best: FtpEstimate | null = null;
  for (const e of bikeEfforts) {
    const factor = rideFtpFactor(e.seconds);
    if (factor === undefined || factor === null || e.watts <= 0) {
      continue;
    }
    const watts = Math.round(e.watts * factor);
    if (!best || watts > best.watts) {
      const mins = Math.round(e.seconds / 60);
      best = { watts, source: `meilleur effort ~${mins} min` };
    }
  }
  return best;
}

/**
 * Estime la FTP vélo. On combine la courbe de puissance (streams, précise mais
 * souvent absente) et les rides entiers (NP × facteur de durée, dispo partout),
 * et on retient la meilleure capacité démontrée.
 */
export function estimateFtp(
  powerCurve: PowerCurvePoint[],
  bikeEfforts: BikeEffort[] = [],
): FtpEstimate | null {
  const fromCurve = ftpFromPowerCurve(powerCurve);
  const fromEfforts = ftpFromBikeEfforts(bikeEfforts);
  if (fromCurve && fromEfforts) {
    return fromCurve.watts >= fromEfforts.watts ? fromCurve : fromEfforts;
  }
  return fromCurve ?? fromEfforts;
}
