import type { SessionIntensity } from '@prisma/client';
import { formatEndurancePrescriptionSummary } from '@sharpit/app/lib/planned-session/endurance/coach-endurance-prescription';
import {
  enduranceSportFromActivityType,
  parseEndurancePrescription,
  singleStepPrescription,
  type EndurancePrescription,
} from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { rescaleEndurancePrescription } from '@sharpit/app/lib/planned-session/endurance/endurance-rescale';
import { defaultTargetForIntensity } from '@sharpit/app/lib/planned-session/endurance/endurance-targets';

export type RecalibratedStructure = {
  /** Undefined: leave the steps; null: drop them, the session is then derived from its length. */
  endurancePrescription?: EndurancePrescription | null;
  description?: string;
};

/**
 * What an accepted morning recalibration writes besides the duration, intensity and load.
 *
 * The steps are the session (ADR-017): a run lightened from 80 to 60 minutes whose steps still
 * add up to 80 is not lightened at all, on the screen nor on the watch. So the steps follow the
 * new length and intensity, and the description is written again from them. Steps that cannot
 * be stretched (repeats, distances) are dropped, and the session reads as derived from its
 * length, as an unstructured one does. A strength session keeps the adapted prose it had.
 */
export function recalibratedStructure(input: {
  type: string;
  endurancePrescription: unknown;
  durationMin: number | null;
  intensity: SessionIntensity | null;
  toDescription: string | null | undefined;
}): RecalibratedStructure {
  const sport = enduranceSportFromActivityType(input.type);
  const stored = parseEndurancePrescription(input.endurancePrescription);
  if (!sport || !stored || input.durationMin === null || input.durationMin <= 0) {
    return { description: input.toDescription ?? undefined };
  }

  const rescaled = rescaleEndurancePrescription({
    prescription: { ...stored, sport },
    durationMin: input.durationMin,
    intensity: input.intensity,
  });
  if (rescaled) {
    return {
      endurancePrescription: rescaled,
      description: formatEndurancePrescriptionSummary(rescaled),
    };
  }

  const derived = singleStepPrescription({
    sport,
    durationMin: input.durationMin,
    target: defaultTargetForIntensity(sport, input.intensity).target,
  });
  return { endurancePrescription: null, description: formatEndurancePrescriptionSummary(derived) };
}
