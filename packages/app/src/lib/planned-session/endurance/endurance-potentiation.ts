/**
 * Strides before hard work (ADR-115).
 *
 * A few short, fast efforts at the end of the warm-up ready the legs for a threshold or VO2
 * block better than easy minutes alone, and this is the best-supported part of a warm-up.
 * They are carved out of the warm-up step the session already has, so the session keeps its
 * length, and they live in the prescription so the watch shows them.
 *
 * Pure: no I/O.
 */
import type { SessionIntensity } from '@prisma/client';
import {
  NO_TARGET,
  type EnduranceBlock,
  type EnduranceDuration,
  type EndurancePrescription,
  type EnduranceSport,
  type EnduranceStep,
} from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';

type Strides = {
  iterations: number;
  work: EnduranceDuration;
  easy: EnduranceDuration;
  easyKind: 'recovery' | 'rest';
  note: string;
};

const RUN_STRIDE = {
  work: { type: 'time', seconds: 20 },
  easy: { type: 'time', seconds: 40 },
  easyKind: 'recovery',
  note: 'Ligne droite progressive, relâché, sans sprinter',
} as const;
const BIKE_SPIN_UP = {
  work: { type: 'time', seconds: 30 },
  easy: { type: 'time', seconds: 60 },
  easyKind: 'recovery',
  note: 'Haute cadence, résistance légère',
} as const;
const SWIM_BUILD = {
  work: { type: 'distance', meters: 25 },
  easy: { type: 'time', seconds: 15 },
  easyKind: 'rest',
  note: 'Progressif sur la longueur',
} as const;

/** Dose table: none below tempo, more as the intensity rises. */
const STRIDES: Record<EnduranceSport, Partial<Record<SessionIntensity, Strides>>> = {
  RUN: {
    TEMPO: { ...RUN_STRIDE, iterations: 2 },
    THRESHOLD: { ...RUN_STRIDE, iterations: 4 },
    VO2MAX: { ...RUN_STRIDE, iterations: 6 },
    RACE: { ...RUN_STRIDE, iterations: 6 },
  },
  BIKE: {
    THRESHOLD: { ...BIKE_SPIN_UP, iterations: 3 },
    VO2MAX: { ...BIKE_SPIN_UP, iterations: 4 },
    RACE: { ...BIKE_SPIN_UP, iterations: 4 },
  },
  SWIM: {
    THRESHOLD: { ...SWIM_BUILD, iterations: 4 },
    VO2MAX: { ...SWIM_BUILD, iterations: 6 },
    RACE: { ...SWIM_BUILD, iterations: 6 },
  },
};

/** What must stay of the easy warm-up once the strides are carved out of it. */
const MIN_EASY_SECONDS = 5 * 60;
const MIN_EASY_METERS = 200;

function seconds(duration: EnduranceDuration): number {
  return duration.type === 'time' ? duration.seconds : 0;
}

/**
 * The easy warm-up left once the strides take their share, or null when too little would be
 * left. A pool warm-up counts lengths, so only the builds' metres come out of it.
 */
function carvedWarmup(warmup: EnduranceDuration, strides: Strides): EnduranceDuration | null {
  const { iterations, work, easy } = strides;
  if (warmup.type === 'time' && work.type === 'time') {
    const left = warmup.seconds - iterations * (work.seconds + seconds(easy));
    return left >= MIN_EASY_SECONDS ? { type: 'time', seconds: left } : null;
  }
  if (warmup.type === 'distance' && work.type === 'distance') {
    const left = warmup.meters - iterations * work.meters;
    return left >= MIN_EASY_METERS ? { type: 'distance', meters: left } : null;
  }
  return null;
}

/** The opening warm-up step, unless the coach already wrote drills right after it. */
function warmupToCarve(blocks: readonly EnduranceBlock[]): EnduranceStep | null {
  const [first, second] = blocks;
  if (first?.kind !== 'step' || first.step.kind !== 'warmup' || !second) {
    return null;
  }
  const coachDrills =
    second.kind === 'repeat' && second.steps.every((step) => step.kind !== 'interval');
  return coachDrills ? null : first.step;
}

/**
 * The prescription with strides at the end of its warm-up when the intensity asks for them,
 * unchanged otherwise (no warm-up step, one too short, or strides already there).
 */
export function withPotentiation(
  prescription: EndurancePrescription,
  intensity: SessionIntensity | null,
): EndurancePrescription {
  const strides = intensity ? STRIDES[prescription.sport][intensity] : undefined;
  const warmup = warmupToCarve(prescription.blocks);
  if (!strides || !warmup) {
    return prescription;
  }
  const easy = carvedWarmup(warmup.duration, strides);
  if (!easy) {
    return prescription;
  }
  const potentiation: EnduranceBlock = {
    kind: 'repeat',
    iterations: strides.iterations,
    steps: [
      { kind: 'warmup', duration: strides.work, target: NO_TARGET, notes: strides.note },
      { kind: strides.easyKind, duration: strides.easy, target: NO_TARGET },
    ],
  };
  return {
    ...prescription,
    blocks: [
      { kind: 'step', step: { ...warmup, duration: easy } },
      potentiation,
      ...prescription.blocks.slice(1),
    ],
  };
}
