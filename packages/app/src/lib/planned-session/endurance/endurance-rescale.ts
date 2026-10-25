import type { SessionIntensity } from '@prisma/client';
import {
  STEP_MIN_SECONDS,
  type EndurancePrescription,
  type EnduranceStep,
  type EnduranceStepKind,
} from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { defaultTargetForIntensity } from '@sharpit/app/lib/planned-session/endurance/endurance-targets';

/** Warm-up and cool-down keep their length as long as they leave the main work this share. */
const MAIN_MIN_SHARE = 0.5;

const EDGE_KINDS = new Set<EnduranceStepKind>(['warmup', 'cooldown']);

function roundToMinute(seconds: number): number {
  return Math.max(STEP_MIN_SECONDS, Math.round(seconds / 60) * 60);
}

function timeSeconds(step: EnduranceStep): number {
  return step.duration.type === 'time' ? step.duration.seconds : 0;
}

function withSeconds(step: EnduranceStep, seconds: number): EnduranceStep {
  return { ...step, duration: { type: 'time', seconds } };
}

/**
 * The same session at a new length and intensity — what a morning lightening (or push) means
 * for its steps. Warm-up and cool-down keep their length while they leave the main work at
 * least half the session, and shrink together otherwise; the main steps share the rest in
 * their old proportions and take the target of the new intensity.
 *
 * Null when the steps cannot be stretched honestly — a repeat, a distance or a lap step: a
 * 6 × 1 km is not "6 × 0.8 km" by arithmetic. The caller then drops the structure and lets the
 * session be derived from its duration and intensity, as an unstructured one is.
 */
export function rescaleEndurancePrescription(input: {
  prescription: EndurancePrescription;
  durationMin: number;
  intensity: SessionIntensity | null;
}): EndurancePrescription | null {
  const { prescription } = input;
  const steps: EnduranceStep[] = [];
  for (const block of prescription.blocks) {
    if (block.kind !== 'step' || block.step.duration.type !== 'time') {
      return null;
    }
    steps.push(block.step);
  }

  const total = input.durationMin * 60;
  const edgeSeconds = steps
    .filter((step) => EDGE_KINDS.has(step.kind))
    .reduce((sum, step) => sum + timeSeconds(step), 0);
  const mainSeconds = steps
    .filter((step) => !EDGE_KINDS.has(step.kind))
    .reduce((sum, step) => sum + timeSeconds(step), 0);

  // Only warm-up and cool-down: they simply share the new length.
  const edgeBudget =
    mainSeconds === 0 ? total : Math.min(edgeSeconds, total * (1 - MAIN_MIN_SHARE));
  const edgeScale = edgeSeconds === 0 ? 0 : edgeBudget / edgeSeconds;
  const mainScale = mainSeconds === 0 ? 0 : (total - edgeBudget) / mainSeconds;
  const { target } = defaultTargetForIntensity(prescription.sport, input.intensity);

  const rescaled = steps.map((step) => {
    if (EDGE_KINDS.has(step.kind)) {
      return withSeconds(step, roundToMinute(timeSeconds(step) * edgeScale));
    }
    const retargeted = step.target.metric === 'none' ? step : { ...step, target };
    return withSeconds(retargeted, roundToMinute(timeSeconds(step) * mainScale));
  });

  // Whole minutes drift from the total: the longest step absorbs the difference.
  const drift = total - rescaled.reduce((sum, step) => sum + timeSeconds(step), 0);
  const longest = rescaled.reduce(
    (best, step, index) => (timeSeconds(step) > timeSeconds(rescaled[best]) ? index : best),
    0,
  );
  rescaled[longest] = withSeconds(
    rescaled[longest],
    Math.max(STEP_MIN_SECONDS, timeSeconds(rescaled[longest]) + drift),
  );

  return {
    ...prescription,
    blocks: rescaled.map((step) => ({ kind: 'step' as const, step })),
  };
}
