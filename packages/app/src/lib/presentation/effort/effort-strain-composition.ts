import type { DailyStrainData } from '@sharpit/app/athlete-state/today-state';

export type EffortStrainContributorKey = 'training' | 'cardiovascular' | 'movement';

export type EffortStrainContributorView = {
  readonly key: EffortStrainContributorKey;
  readonly label: string;
  readonly description: string;
  readonly available: boolean;
  readonly load: number | null;
  readonly score: number | null;
  readonly signalSummary: string | null;
};

/**
 * The raw daily readings, kept out of the summary strings.
 *
 * Steps, stress and Body Battery were only reachable as a formatted sentence
 * ("stress 34 · Body Battery 61"), which meant nothing could put them on a scale
 * or chart them. They are numbers; they leave here as numbers.
 */
export type EffortDailySignals = {
  readonly steps: number | null;
  readonly stress: number | null;
  readonly bodyBattery: number | null;
};

export type EffortStrainCompositionView = {
  readonly available: boolean;
  readonly dominantKey: EffortStrainContributorKey | null;
  readonly contributors: readonly EffortStrainContributorView[];
  readonly signals: EffortDailySignals;
};

const CONTRIBUTOR_META: Record<
  EffortStrainContributorKey,
  { label: string; emptyDescription: string; availableDescription: string }
> = {
  training: {
    label: 'Entraînement',
    emptyDescription: 'Aucune activité d’entraînement aujourd’hui',
    availableDescription: 'Activités du jour',
  },
  cardiovascular: {
    label: 'Cardiovasculaire',
    emptyDescription: 'Stress et Body Battery non disponibles',
    availableDescription: 'Stress et Body Battery — charge cardio du jour',
  },
  movement: {
    label: 'Effort passif',
    emptyDescription: 'Pas quotidiens non disponibles',
    availableDescription: 'Mouvement hors séance (pas / NEAT)',
  },
};

function toContributor(
  key: EffortStrainContributorKey,
  contribution: DailyStrainData['contributions'][EffortStrainContributorKey],
  signalSummary: string | null,
): EffortStrainContributorView {
  const meta = CONTRIBUTOR_META[key];
  if (!contribution.available || contribution.load === undefined || contribution.load === null) {
    return {
      key,
      label: meta.label,
      description: meta.emptyDescription,
      available: false,
      load: null,
      score: null,
      signalSummary: null,
    };
  }

  return {
    key,
    label: meta.label,
    description: signalSummary ?? meta.availableDescription,
    available: true,
    load: contribution.load,
    score: contribution.score,
    signalSummary,
  };
}

function mapDominantKey(
  dominant: DailyStrainData['dominantContributor'],
): EffortStrainContributorKey | null {
  if (dominant === 'TRAINING') {
    return 'training';
  }
  if (dominant === 'CARDIOVASCULAR') {
    return 'cardiovascular';
  }
  if (dominant === 'MOVEMENT') {
    return 'movement';
  }
  return null;
}

/**
 * Pure presentation mapper — no physiological inference.
 * Turns daily-strain contributions into athlete-facing composition rows.
 */
export function buildEffortStrainComposition(
  dailyStrain: DailyStrainData | null | undefined,
): EffortStrainCompositionView {
  if (!dailyStrain?.available) {
    return {
      available: false,
      dominantKey: null,
      contributors: [
        toContributor('training', emptyContribution(), null),
        toContributor('cardiovascular', emptyContribution(), null),
        toContributor('movement', emptyContribution(), null),
      ],
      signals: { steps: null, stress: null, bodyBattery: null },
    };
  }

  return {
    available: true,
    dominantKey: mapDominantKey(dailyStrain.dominantContributor),
    contributors: [
      toContributor('training', dailyStrain.contributions.training, null),
      toContributor('cardiovascular', dailyStrain.contributions.cardiovascular, null),
      toContributor('movement', dailyStrain.contributions.movement, null),
    ],
    signals: {
      steps: dailyStrain.trace.movementSignals?.totalSteps ?? null,
      stress: dailyStrain.trace.cardiovascularSignals.stress ?? null,
      bodyBattery: dailyStrain.trace.cardiovascularSignals.bodyBattery ?? null,
    },
  };
}

function emptyContribution(): DailyStrainData['contributions']['training'] {
  return {
    available: false,
    contributor: 'TRAINING',
    load: null,
    score: null,
    confidence: 0,
    source: 'UNKNOWN',
  };
}
