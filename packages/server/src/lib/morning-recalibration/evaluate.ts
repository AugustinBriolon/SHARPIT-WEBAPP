/**
 * Morning session recalibration — Presentation-layer V1.1.
 *
 * Once sleep and recovery are read (the check-in refines it), propose a bidirectional
 * adjustment of today's planned session. Never auto-applies.
 * Sport-aware: endurance ladder vs strength-like effort language + structure rewrite.
 * Reads DecisionState / session only — no new Core engine.
 */

import type { ActivityType, SessionIntensity } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { adaptMorningSessionDescription } from '@sharpit/server/lib/morning-recalibration/adapt-session-description';
import {
  isEnduranceMorningSport,
  isStrengthLikeMorningSport,
  morningIntensityLabel,
} from '@sharpit/app/lib/morning-recalibration/sport-intensity-labels';
import { intensityOrder } from '@sharpit/app/lib/planned-session/sessions';

export type MorningRecalibrationDirection = 'DOWN' | 'UP';

export type MorningRecalibrationSessionInput = {
  id: string;
  type: ActivityType;
  intensity: SessionIntensity | null;
  durationMin: number | null;
  load: number | null;
  title: string | null;
  description: string | null;
  completed: boolean;
  activityId: string | null;
};

export type MorningRecalibrationDecisionInput = {
  overallVerdict: string | null;
  confidenceTier: string | null;
  fatigueTrainingCapacity?: string | null;
};

export type MorningRecalibrationProposal = {
  sessionId: string;
  direction: MorningRecalibrationDirection;
  fromIntensity: SessionIntensity | null;
  toIntensity: SessionIntensity | null;
  fromDurationMin: number | null;
  toDurationMin: number | null;
  fromLoad: number | null;
  toLoad: number | null;
  fromDescription: string | null;
  toDescription: string | null;
  changeSummary: string;
  why: string;
};

const HIGH_INTENSITY = new Set<SessionIntensity>(['THRESHOLD', 'VO2MAX', 'RACE']);
const PROTECT_VERDICTS = new Set(['RECOVER', 'CAUTION']);
const PUSH_VERDICTS = new Set(['TRAIN_HARD']);
const SMART_VERDICTS = new Set(['TRAIN_SMART']);

/** All planned sports can receive a morning proposal — wording differs by family. */
export function isMorningRecalibrationEligibleSport(type: ActivityType): boolean {
  return isEnduranceMorningSport(type) || isStrengthLikeMorningSport(type);
}

function stepIntensity(current: SessionIntensity, delta: -1 | 1): SessionIntensity | null {
  const idx = intensityOrder.indexOf(current);
  if (idx < 0) {
    return null;
  }
  const next = intensityOrder[idx + delta];
  return next ?? null;
}

type ChangeSummaryInput = {
  type: ActivityType;
  from: SessionIntensity | null;
  to: SessionIntensity | null;
  fromLoad: number | null;
  toLoad: number | null;
  fromDuration: number | null;
  toDuration: number | null;
  structureChanged: boolean;
};

function summarizeIntensityChange(
  type: ActivityType,
  from: SessionIntensity,
  to: SessionIntensity,
): string {
  const fromLabel = morningIntensityLabel(type, from) ?? from;
  const toLabel = morningIntensityLabel(type, to) ?? to;
  return `${fromLabel} → ${toLabel}`;
}

function summarizeLoadChange(fromLoad: number | null, toLoad: number | null): string | null {
  if (
    fromLoad === undefined ||
    fromLoad === null ||
    toLoad === undefined ||
    toLoad === null ||
    fromLoad === toLoad
  ) {
    return null;
  }
  return `charge ${Math.round(fromLoad)} → ${Math.round(toLoad)}`;
}

function summarizeDurationChange(
  fromDuration: number | null,
  toDuration: number | null,
): string | null {
  if (
    fromDuration === undefined ||
    fromDuration === null ||
    toDuration === undefined ||
    toDuration === null ||
    fromDuration === toDuration
  ) {
    return null;
  }
  return `${fromDuration} → ${toDuration} min`;
}

function summarizeChange(input: ChangeSummaryInput): string {
  const parts: string[] = [];
  if (input.from && input.to && input.from !== input.to) {
    parts.push(summarizeIntensityChange(input.type, input.from, input.to));
  }
  const loadPart = summarizeLoadChange(input.fromLoad, input.toLoad);
  if (loadPart) {
    parts.push(loadPart);
  }
  const durationPart = summarizeDurationChange(input.fromDuration, input.toDuration);
  if (durationPart) {
    parts.push(durationPart);
  }
  if (input.structureChanged) {
    parts.push('déroulé adapté');
  }
  return parts.join(' · ') || 'Ajustement de séance';
}

type ProposalDraft = Omit<
  MorningRecalibrationProposal,
  'fromDescription' | 'toDescription' | 'changeSummary'
>;

type WithDescriptionsInput = {
  type: ActivityType;
  direction: MorningRecalibrationDirection;
  fromDescription: string | null;
  base: ProposalDraft;
  changeSummary: Omit<ChangeSummaryInput, 'type' | 'structureChanged'>;
};

function withDescriptions(input: WithDescriptionsInput): MorningRecalibrationProposal {
  const toDescription = adaptMorningSessionDescription({
    type: input.type,
    description: input.fromDescription,
    direction: input.direction,
  });
  const structureChanged =
    isStrengthLikeMorningSport(input.type) &&
    (toDescription ?? '') !== (input.fromDescription?.trim() || '');

  return {
    ...input.base,
    fromDescription: input.fromDescription?.trim() || null,
    toDescription,
    changeSummary: summarizeChange({
      type: input.type,
      structureChanged,
      ...input.changeSummary,
    }),
  };
}

type BuildProposalInput = {
  session: MorningRecalibrationSessionInput;
  direction: MorningRecalibrationDirection;
  toIntensity: SessionIntensity;
  toDuration: number | null;
  toLoad: number | null;
  why: string;
};

function buildProposal(input: BuildProposalInput): MorningRecalibrationProposal {
  const { session, direction, toIntensity, toDuration, toLoad, why } = input;
  return withDescriptions({
    type: session.type,
    direction,
    fromDescription: session.description,
    base: {
      sessionId: session.id,
      direction,
      fromIntensity: session.intensity,
      toIntensity,
      fromDurationMin: session.durationMin,
      toDurationMin: toDuration,
      fromLoad: session.load,
      toLoad,
      why,
    },
    changeSummary: {
      from: session.intensity,
      to: toIntensity,
      fromLoad: session.load,
      toLoad,
      fromDuration: session.durationMin,
      toDuration,
    },
  });
}

function hasEligibleSession(
  session: MorningRecalibrationSessionInput | null,
): session is MorningRecalibrationSessionInput {
  if (!session || session.completed || session.activityId) {
    return false;
  }
  return isMorningRecalibrationEligibleSport(session.type) && isSet(session.intensity);
}

function hasEligibleDecision(
  decision: MorningRecalibrationDecisionInput | null,
): decision is MorningRecalibrationDecisionInput & {
  overallVerdict: string;
  confidenceTier: string;
} {
  return Boolean(decision?.overallVerdict && decision.confidenceTier !== 'INSUFFICIENT');
}

function isEligibleForRecalibration(input: {
  session: MorningRecalibrationSessionInput | null;
  decision: MorningRecalibrationDecisionInput | null;
}): input is {
  session: MorningRecalibrationSessionInput;
  decision: MorningRecalibrationDecisionInput & {
    overallVerdict: string;
    confidenceTier: string;
  };
} {
  return hasEligibleSession(input.session) && hasEligibleDecision(input.decision);
}

function protectWhy(strengthLike: boolean, verdict: string, _capacity: string | null): string {
  const protectVerdict = verdict === 'RECOVER' || verdict === 'CAUTION';
  if (strengthLike && protectVerdict) {
    return 'Alléger les charges et prioriser le contrôle du mouvement.';
  }
  if (strengthLike) {
    return 'Capacité légère uniquement. Pas de travail exigeant aujourd’hui.';
  }
  if (protectVerdict) {
    return 'Baisser l’intensité protège le risque blessure sans abandonner le plan.';
  }
  return 'Capacité légère uniquement. La haute intensité n’est pas cohérente aujourd’hui.';
}

function buildRestOnlyProposal(
  session: MorningRecalibrationSessionInput,
  capacity: string | null,
): MorningRecalibrationProposal | null {
  if (capacity !== 'REST_ONLY' || session.intensity === 'RECOVERY') {
    return null;
  }
  const strengthLike = isStrengthLikeMorningSport(session.type);
  const toDuration = isSet(session.durationMin)
    ? Math.min(session.durationMin, strengthLike ? 35 : 30)
    : session.durationMin;
  const toLoad = isSet(session.load)
    ? Math.min(Math.round(session.load * 0.35), strengthLike ? 18 : 25)
    : null;
  return buildProposal({
    session,
    direction: 'DOWN',
    toIntensity: 'RECOVERY',
    toDuration,
    toLoad,
    why: strengthLike
      ? 'Capacité du jour limitée au repos. Garder mobilité / technique légère, pas de charges.'
      : 'Capacité du jour limitée au repos. La séance prévue est trop exigeante.',
  });
}

function buildHighIntensityDowngrade(
  session: MorningRecalibrationSessionInput,
  verdict: string,
  capacity: string | null,
): MorningRecalibrationProposal | null {
  const { intensity, load } = session;
  if (!intensity || !HIGH_INTENSITY.has(intensity)) {
    return null;
  }
  if (capacity !== 'LIGHT_ONLY' && !PROTECT_VERDICTS.has(verdict)) {
    return null;
  }
  const toLoad = isSet(load) ? Math.round(load * 0.6) : null;
  return buildProposal({
    session,
    direction: 'DOWN',
    toIntensity: 'ENDURANCE',
    toDuration: session.durationMin,
    toLoad,
    why: protectWhy(isStrengthLikeMorningSport(session.type), verdict, capacity),
  });
}

function buildTempoDowngrade(
  session: MorningRecalibrationSessionInput,
  verdict: string,
): MorningRecalibrationProposal | null {
  if (!PROTECT_VERDICTS.has(verdict) || session.intensity !== 'TEMPO') {
    return null;
  }
  const toIntensity = stepIntensity(session.intensity!, -1);
  if (!toIntensity) {
    return null;
  }
  const toLoad = isSet(session.load) ? Math.round(session.load * 0.75) : null;
  const strengthLike = isStrengthLikeMorningSport(session.type);
  return buildProposal({
    session,
    direction: 'DOWN',
    toIntensity,
    toDuration: session.durationMin,
    toLoad,
    why: strengthLike
      ? 'Sommeil / récup / ressenti orientent vers la prudence. Un cran plus léger, sans exercices lourds.'
      : 'Sommeil / récup / ressenti orientent vers la prudence. Un cran en dessous conserve l’objectif.',
  });
}

function buildStrengthEnduranceDowngrade(
  session: MorningRecalibrationSessionInput,
  verdict: string,
): MorningRecalibrationProposal | null {
  if (
    !isStrengthLikeMorningSport(session.type) ||
    !PROTECT_VERDICTS.has(verdict) ||
    session.intensity !== 'ENDURANCE'
  ) {
    return null;
  }
  const toLoad = isSet(session.load) ? Math.round(session.load * 0.7) : null;
  return buildProposal({
    session,
    direction: 'DOWN',
    toIntensity: 'RECOVERY',
    toDuration: session.durationMin,
    toLoad,
    why: 'Prudence du matin. Garder mobilité et posture, retirer le travail lesté.',
  });
}

/** An endurance outing on a day to protect: kept, a quarter shorter, at recovery pace. */
function buildEnduranceDowngrade(
  session: MorningRecalibrationSessionInput,
  verdict: string,
): MorningRecalibrationProposal | null {
  if (
    isStrengthLikeMorningSport(session.type) ||
    !PROTECT_VERDICTS.has(verdict) ||
    session.intensity !== 'ENDURANCE'
  ) {
    return null;
  }
  const toDuration = isSet(session.durationMin)
    ? Math.max(20, Math.round((session.durationMin * 0.75) / 5) * 5)
    : session.durationMin;
  const toLoad = isSet(session.load) ? Math.round(session.load * 0.7) : null;
  return buildProposal({
    session,
    direction: 'DOWN',
    toIntensity: 'RECOVERY',
    toDuration,
    toLoad,
    why: 'Garder la sortie, un quart plus courte et en récupération, pour récupérer sans perdre le fil.',
  });
}

function buildRecoveryUpgrade(
  session: MorningRecalibrationSessionInput,
  verdict: string,
): MorningRecalibrationProposal | null {
  if (!PUSH_VERDICTS.has(verdict) || session.intensity !== 'RECOVERY') {
    return null;
  }
  const strengthLike = isStrengthLikeMorningSport(session.type);
  const toLoad = isSet(session.load) ? Math.round(session.load * 1.15) : null;
  return buildProposal({
    session,
    direction: 'UP',
    toIntensity: 'ENDURANCE',
    toDuration: session.durationMin,
    toLoad,
    why: strengthLike
      ? 'État du matin solide. Tu peux viser un travail léger un cran au-dessus de la pure récupération.'
      : 'État du matin excellent. Tu peux viser un cran au-dessus de la récupération prévue.',
  });
}

function buildEnduranceUpgrade(
  session: MorningRecalibrationSessionInput,
  verdict: string,
): MorningRecalibrationProposal | null {
  if (!PUSH_VERDICTS.has(verdict) || session.intensity !== 'ENDURANCE') {
    return null;
  }
  const strengthLike = isStrengthLikeMorningSport(session.type);
  const toLoad = isSet(session.load) ? Math.round(session.load * 1.12) : null;
  return buildProposal({
    session,
    direction: 'UP',
    toIntensity: 'TEMPO',
    toDuration: session.durationMin,
    toLoad,
    why: strengthLike
      ? 'Sommeil et ressenti solides. Un cran en modéré reste cadré ; progression de charge seulement si la technique est propre.'
      : 'Sommeil et ressenti solides. Un tempo léger reste cadré par l’objectif long terme.',
  });
}

function buildSmartRecoveryUpgrade(
  session: MorningRecalibrationSessionInput,
  decision: MorningRecalibrationDecisionInput,
): MorningRecalibrationProposal | null {
  if (
    !SMART_VERDICTS.has(decision.overallVerdict ?? '') ||
    session.intensity !== 'RECOVERY' ||
    decision.confidenceTier !== 'HIGH'
  ) {
    return null;
  }
  const strengthLike = isStrengthLikeMorningSport(session.type);
  return buildProposal({
    session,
    direction: 'UP',
    toIntensity: 'ENDURANCE',
    toDuration: session.durationMin,
    toLoad: session.load,
    why: strengthLike
      ? 'État fiable et séance très légère. Un passage en travail léger reste prudent.'
      : 'État fiable et séance très légère. Un passage en endurance reste prudent.',
  });
}

function resolveMorningProposal(
  session: MorningRecalibrationSessionInput,
  decision: MorningRecalibrationDecisionInput & {
    overallVerdict: string;
    confidenceTier: string;
  },
): MorningRecalibrationProposal | null {
  const verdict = decision.overallVerdict;
  const capacity = decision.fatigueTrainingCapacity ?? null;

  return (
    buildRestOnlyProposal(session, capacity) ??
    buildHighIntensityDowngrade(session, verdict, capacity) ??
    buildTempoDowngrade(session, verdict) ??
    buildStrengthEnduranceDowngrade(session, verdict) ??
    buildEnduranceDowngrade(session, verdict) ??
    buildRecoveryUpgrade(session, verdict) ??
    buildEnduranceUpgrade(session, verdict) ??
    buildSmartRecoveryUpgrade(session, decision)
  );
}

/**
 * Pure evaluator — returns null when silence is the correct product answer.
 */
export function evaluateMorningSessionRecalibration(input: {
  session: MorningRecalibrationSessionInput | null;
  decision: MorningRecalibrationDecisionInput | null;
}): MorningRecalibrationProposal | null {
  if (!isEligibleForRecalibration(input)) {
    return null;
  }

  return resolveMorningProposal(input.session, input.decision);
}

export {
  isEnduranceMorningSport,
  isStrengthLikeMorningSport,
  morningIntensityLabel,
} from '@sharpit/app/lib/morning-recalibration/sport-intensity-labels';
