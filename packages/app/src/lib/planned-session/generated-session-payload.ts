/**
 * A coach-generated session, turned into the planned-session create body: the coach's
 * prescriptions normalized for storage and the description rebuilt from them. One mapping for
 * the web's plan generator and the native insert route (`/api/v1/coach/plan/insert`), so a
 * week the coach wrote is stored the same way whichever client adds it.
 */
import type { ActivityType, SessionIntensity } from '@prisma/client';
import { resolveEnduranceFieldsForPersist } from '@sharpit/app/lib/planned-session/endurance/coach-endurance-prescription';
import type { CoachEndurancePrescription } from '@sharpit/app/lib/planned-session/endurance/coach-endurance-prescription';
import { resolveStrengthFieldsForPersist } from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import type { CoachStrengthPrescription } from '@sharpit/app/lib/planned-session/strength/strength-prescription';

export type GeneratedSessionInput = {
  date: string; // yyyy-MM-dd
  startTime: string | null;
  type: ActivityType;
  intensity: SessionIntensity;
  title: string;
  description: string;
  strengthPrescription?: CoachStrengthPrescription | null;
  endurancePrescription?: CoachEndurancePrescription | null;
  durationMin: number;
  load: number;
  decisionId: string | null;
  /** One of the week's key sessions (`chooseKeySessions`). */
  key?: boolean;
};

export function generatedSessionPayload(session: GeneratedSessionInput, goalId: string | null) {
  const strength = resolveStrengthFieldsForPersist({
    type: session.type,
    description: session.description,
    strengthPrescription: session.strengthPrescription,
  });
  const endurance = resolveEnduranceFieldsForPersist({
    type: session.type,
    description: strength.description,
    intensity: session.intensity,
    endurancePrescription: session.endurancePrescription,
  });
  return {
    type: session.type,
    date: new Date(`${session.date}T12:00:00`),
    startTime: session.startTime,
    title: session.title,
    // The coach writes no prose any more; a session without steps still needs a line to store.
    description: endurance.description ?? session.title,
    strengthPrescription: strength.strengthPrescription,
    endurancePrescription: endurance.endurancePrescription,
    durationMin: session.durationMin,
    load: session.load,
    intensity: session.intensity,
    goalId,
    isKey: session.key ?? false,
    decisionId: session.decisionId,
  };
}
