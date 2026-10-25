import {
  KIND_LABEL_FR,
  STROKE_LABEL_FR,
  formatTargetLabel,
} from '@sharpit/app/lib/planned-session/endurance/endurance-preview';
import type {
  EndurancePrescription,
  EnduranceSport,
  EnduranceStep,
  EnduranceStepKind,
  SwimStroke,
} from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import {
  resolveEnduranceTarget,
  type AthleteThresholds,
  type ResolvedTarget,
} from '@sharpit/app/lib/planned-session/endurance/endurance-targets';
import { isSet } from '@sharpit/shared/value';

/** Training API V2 §3.1: one segment holds at most 100 steps, repeat groups included. */
export const GARMIN_MAX_SINGLE_SPORT_STEPS = 100;

const PROVIDER = 'SharpIt';

const SPORT_BY_KEY: Record<EnduranceSport, string> = {
  RUN: 'RUNNING',
  BIKE: 'CYCLING',
  SWIM: 'LAP_SWIMMING',
};

const INTENSITY_BY_KIND: Record<EnduranceStepKind, string> = {
  warmup: 'WARMUP',
  interval: 'INTERVAL',
  recovery: 'RECOVERY',
  rest: 'REST',
  cooldown: 'COOLDOWN',
};

/** `drill` has no stroke of its own in V2: the step description still names it. */
const STROKE_BY_KEY: Record<SwimStroke, string> = {
  free: 'FREESTYLE',
  back: 'BACKSTROKE',
  breast: 'BREASTSTROKE',
  fly: 'BUTTERFLY',
  im: 'IM',
  drill: 'CHOICE',
  mixed: 'MIXED',
};

const SWIM_TARGET_DROPPED =
  'Cible FC, puissance ou cadence ignorée en natation : Garmin ne la prend pas.';

type Json = Record<string, unknown>;

export type GarminWorkoutPayload = {
  payload: Json;
  /** Every step Garmin counts, repeat groups included. */
  stepCount: number;
  /** Targets that could not be resolved or sent, athlete-facing. */
  warnings: string[];
};

type BuildContext = {
  sport: EnduranceSport;
  thresholds: AthleteThresholds;
  warnings: Set<string>;
  order: number;
};

function durationFields(step: EnduranceStep, sport: EnduranceSport): Json {
  const { duration } = step;
  if (duration.type === 'time') {
    // A pool rest is a wall rest: V2 wants FIXED_REST there, not a timed step.
    const restInPool = sport === 'SWIM' && step.kind === 'rest';
    return { durationType: restInPool ? 'FIXED_REST' : 'TIME', durationValue: duration.seconds };
  }
  if (duration.type === 'distance') {
    return { durationType: 'DISTANCE', durationValue: duration.meters, durationValueType: 'METER' };
  }
  return { durationType: 'OPEN', durationValue: null };
}

function landTargetFields(resolved: ResolvedTarget): Json {
  switch (resolved.metric) {
    case 'pace':
      return {
        targetType: 'PACE',
        targetValueLow: resolved.speedMsMin,
        targetValueHigh: resolved.speedMsMax,
      };
    case 'hr':
      return {
        targetType: 'HEART_RATE',
        targetValueLow: resolved.bpmMin,
        targetValueHigh: resolved.bpmMax,
      };
    case 'power':
      return {
        targetType: 'POWER',
        targetValueLow: resolved.wattsMin,
        targetValueHigh: resolved.wattsMax,
      };
    case 'cadence':
      return { targetType: 'CADENCE', targetValueLow: resolved.min, targetValueHigh: resolved.max };
    default:
      return { targetType: 'OPEN' };
  }
}

/** A pool step takes no primary target: pace rides as the secondary PACE_ZONE (Appendix C). */
function swimTargetFields(resolved: ResolvedTarget, warnings: Set<string>): Json {
  if (resolved.metric === 'pace') {
    return {
      targetType: null,
      secondaryTargetType: 'PACE_ZONE',
      secondaryTargetValueLow: resolved.speedMsMin,
      secondaryTargetValueHigh: resolved.speedMsMax,
    };
  }
  if (resolved.metric !== 'none') {
    warnings.add(SWIM_TARGET_DROPPED);
  }
  return { targetType: null };
}

function buildStep(step: EnduranceStep, context: BuildContext): Json {
  const { resolved, warnings } = resolveEnduranceTarget(
    step.target,
    context.thresholds,
    context.sport,
  );
  warnings.forEach((warning) => context.warnings.add(warning));

  const stroke = context.sport === 'SWIM' ? (step.stroke ?? null) : null;
  const description = [
    KIND_LABEL_FR[step.kind],
    stroke ? STROKE_LABEL_FR[stroke] : null,
    formatTargetLabel(resolved),
    step.notes?.trim(),
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 512);

  context.order += 1;
  return {
    type: 'WorkoutStep',
    stepOrder: context.order,
    intensity: INTENSITY_BY_KIND[step.kind],
    description,
    ...durationFields(step, context.sport),
    ...(context.sport === 'SWIM'
      ? swimTargetFields(resolved, context.warnings)
      : landTargetFields(resolved)),
    ...(stroke ? { strokeType: STROKE_BY_KEY[stroke] } : {}),
  };
}

function buildSteps(prescription: EndurancePrescription, context: BuildContext): Json[] {
  return prescription.blocks.map((block) => {
    if (block.kind === 'step') {
      return buildStep(block.step, context);
    }
    context.order += 1;
    const stepOrder = context.order;
    return {
      type: 'WorkoutRepeatStep',
      stepOrder,
      repeatType: 'REPEAT_UNTIL_STEPS_CMPLT',
      repeatValue: block.iterations,
      skipLastRestStep: false,
      steps: block.steps.map((step) => buildStep(step, context)),
    };
  });
}

/**
 * A planned endurance session as a Training API V2 single-sport workout.
 *
 * Relative targets are resolved here against the thresholds passed in, so the watch gets
 * today's numbers. A step whose target cannot be resolved is still sent, without guidance,
 * and the reason lands in `warnings` instead of being dropped silently.
 */
export function buildGarminWorkoutPayload(input: {
  workoutName: string;
  description?: string | null;
  prescription: EndurancePrescription;
  thresholds: AthleteThresholds;
}): GarminWorkoutPayload {
  const { prescription } = input;
  const context: BuildContext = {
    sport: prescription.sport,
    thresholds: input.thresholds,
    warnings: new Set<string>(),
    order: 0,
  };
  const steps = buildSteps(prescription, context);
  const sport = SPORT_BY_KEY[prescription.sport];
  // V2 needs the unit whenever a pool step carries a pace; the length itself may stay open.
  const pool =
    prescription.sport === 'SWIM'
      ? { poolLength: prescription.poolLengthM ?? null, poolLengthUnit: 'METER' }
      : { poolLength: null, poolLengthUnit: null };

  const payload: Json = {
    workoutName: input.workoutName.trim().slice(0, 100),
    sport,
    ...pool,
    workoutProvider: PROVIDER,
    workoutSourceId: PROVIDER,
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport, ...pool, steps }],
  };
  const description = input.description?.trim();
  if (isSet(description) && description.length > 0) {
    payload.description = description.slice(0, 1024);
  }

  return { payload, stepCount: context.order, warnings: [...context.warnings] };
}
