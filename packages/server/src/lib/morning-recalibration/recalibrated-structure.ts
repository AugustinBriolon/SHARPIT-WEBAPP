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
import {
  renameIntensityInText,
  retargetStrengthPrescription,
} from '@sharpit/app/lib/planned-session/intensity-retarget';
import {
  parseStrengthPrescription,
  type StrengthPrescription,
} from '@sharpit/app/lib/planned-session/strength/strength-prescription';

export type RecalibratedStructure = {
  /** Undefined: leave the steps; null: drop them, the session is then derived from its length. */
  endurancePrescription?: EndurancePrescription | null;
  /** Undefined: leave the sets. */
  strengthPrescription?: StrengthPrescription;
  description?: string;
  /** Undefined: leave the title — it names no intensity, or the intensity did not move. */
  title?: string;
};

/**
 * What a change of intensity or length writes besides the duration, intensity and load — the
 * session itself, not only its label.
 *
 * The steps are the session (ADR-017): a run lightened from 80 to 60 minutes whose steps still
 * add up to 80 is not lightened at all, on the screen nor on the watch. So the steps follow the
 * new length and intensity, and the description is written again from them. Steps that cannot
 * be stretched (repeats, distances) are dropped, and the session reads as derived from its
 * length, as an unstructured one does. A strength session's sets and loads follow the
 * intensity. A title or free text naming the old intensity names the new one.
 */
export function recalibratedStructure(input: {
  type: string;
  endurancePrescription: unknown;
  strengthPrescription?: unknown;
  durationMin: number | null;
  fromIntensity?: SessionIntensity | null;
  intensity: SessionIntensity | null;
  title?: string | null;
  toDescription: string | null | undefined;
}): RecalibratedStructure {
  const renamedTitle = renameIntensityInText(
    input.title ?? null,
    input.fromIntensity ?? null,
    input.intensity,
  );
  const title = renamedTitle !== (input.title ?? null) ? (renamedTitle ?? undefined) : undefined;
  return { ...structureFor(input), ...(title === undefined ? {} : { title }) };
}

function structureFor(input: Parameters<typeof recalibratedStructure>[0]): RecalibratedStructure {
  const prose =
    renameIntensityInText(
      input.toDescription ?? null,
      input.fromIntensity ?? null,
      input.intensity,
    ) ?? undefined;
  const sport = enduranceSportFromActivityType(input.type);
  if (!sport) {
    return strengthStructure(input, prose);
  }
  const stored = parseEndurancePrescription(input.endurancePrescription);
  if (!stored || input.durationMin === null || input.durationMin <= 0) {
    return { description: prose };
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

function strengthStructure(
  input: Parameters<typeof recalibratedStructure>[0],
  prose: string | undefined,
): RecalibratedStructure {
  const stored = parseStrengthPrescription(input.strengthPrescription);
  const retargeted = stored
    ? retargetStrengthPrescription({
        prescription: stored,
        from: input.fromIntensity ?? null,
        to: input.intensity,
      })
    : null;
  return retargeted
    ? { strengthPrescription: retargeted, description: prose }
    : { description: prose };
}
