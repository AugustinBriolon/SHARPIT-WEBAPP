/**
 * Shared day-score lines for discuss blocks (morning-brief, today — ADR-079).
 * Deterministic: no LLM. Callers assemble the header; this formats the numbers.
 */

import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  mapVerdictToDisplay,
  type OverallVerdict,
} from '@sharpit/app/lib/today/dashboard/today-mapping';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { formatPlannedDuration, intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import {
  loadV1DayScores,
  type V1DayScores,
  type V1TodayEnergyBank,
  type V1TodayStress,
  type V1TodayTargetBand,
} from '@sharpit/server/lib/presentation/v1/day-scores';
import { getHealthEntries, getPlannedSessions } from '@sharpit/server/lib/queries';
import {
  ensureMorningRecalibration,
  type MorningRecalibrationPresentation,
} from '@sharpit/server/lib/morning-recalibration/service';
import { analyzeSleep, toSleepEntryInputs } from '@sharpit/app/lib/sleep/sleep';
import { isSet } from '@sharpit/shared/value';

/** Same wording as `morningProposalLine` — kept local to avoid a push↔discuss import cycle. */
function proposalLineFromPresentation(
  proposal: MorningRecalibrationPresentation | null | undefined,
): string | null {
  if (!proposal || proposal.status !== 'PRESENTED') {
    return null;
  }
  const lead =
    proposal.direction === 'DOWN'
      ? 'Ta nuit invite à lever le pied'
      : 'Tu as bien récupéré, on peut monter d’un cran';
  return `${lead} : ${proposal.changeSummary}`;
}

type Line = string | null | false | undefined;

function joinBits(bits: Line[]): string {
  return bits.filter(Boolean).join(' · ');
}

/** Compact FR line for lock-screen / chip enrichment (Energy Bank, stress, target). */
export function formatDayScoresPushBits(scores: V1DayScores | null | undefined): string | null {
  if (!scores) {
    return null;
  }
  const bits: string[] = [];
  if (isSet(scores.energyBank?.value)) {
    bits.push(`Réserve ${Math.round(scores.energyBank.value)}`);
  }
  if (scores.stress) {
    bits.push(`Stress ${Math.round(scores.stress.value)}`);
  }
  if (bits.length < 2 && scores.targetBand) {
    bits.push(`Cible ${Math.round(scores.targetBand.low)}–${Math.round(scores.targetBand.high)}`);
  }
  return bits.length > 0 ? bits.slice(0, 2).join(' · ') : null;
}

function energyLine(energy: V1TodayEnergyBank | null): string | null {
  if (!energy || !isSet(energy.value)) {
    return null;
  }
  const typical = isSet(energy.typicalBaseline)
    ? ` (typ. ${Math.round(energy.typicalBaseline)})`
    : '';
  return `- Réserve d'énergie : ${Math.round(energy.value)}/100${typical}`;
}

function stressLine(stress: V1TodayStress | null): string | null {
  if (!stress) {
    return null;
  }
  return `- Stress : ${Math.round(stress.value)}/100`;
}

function targetLine(band: V1TodayTargetBand | null): string | null {
  if (!band) {
    return null;
  }
  const status =
    band.status === 'below'
      ? 'sous la cible'
      : band.status === 'within'
        ? 'dans la cible'
        : band.status === 'above'
          ? 'au-dessus'
          : null;
  return joinBits([`- Cible d'effort : ${Math.round(band.low)}–${Math.round(band.high)}`, status]);
}

function sleepNeededLine(sleepNeededMin: number | null | undefined): string | null {
  if (!isSet(sleepNeededMin) || sleepNeededMin <= 0) {
    return null;
  }
  const hours = Math.floor(sleepNeededMin / 60);
  const mins = sleepNeededMin % 60;
  const label = mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  return `- Sommeil nécessaire : ${label}`;
}

function readinessLine(readiness: number | null | undefined): string | null {
  if (!isSet(readiness)) {
    return null;
  }
  return `- Forme : ${Math.round(readiness)}/100`;
}

/** Lines naming ADR-079 scores (+ optional readiness / sleep needed). */
export function formatDayScoresDiscussLines(input: {
  scores: V1DayScores;
  readiness?: number | null;
  sleepNeededMin?: number | null;
}): Line[] {
  return [
    energyLine(input.scores.energyBank),
    stressLine(input.scores.stress),
    targetLine(input.scores.targetBand),
    readinessLine(input.readiness),
    sleepNeededLine(input.sleepNeededMin),
  ];
}

export type MorningBriefDiscussData = {
  trainingDayId: string;
  verdictLabel: string | null;
  scores: V1DayScores;
  readiness: number | null;
  sessionLine: string | null;
  proposalLine: string | null;
  productMessage: string | null;
};

export function formatMorningBriefDiscussBlock(data: MorningBriefDiscussData): string {
  const dayLabel = format(parseISO(data.trainingDayId), 'EEEE d MMMM', { locale: fr });
  const lines: Line[] = [
    `Jour : ${dayLabel} (${data.trainingDayId}).`,
    data.verdictLabel ? `- Verdict : ${data.verdictLabel}` : null,
    ...formatDayScoresDiscussLines({ scores: data.scores, readiness: data.readiness }),
    data.sessionLine
      ? `- Séance du jour : ${data.sessionLine}`
      : '- Séance du jour : aucune planifiée.',
    data.proposalLine ? `- Proposition matin : ${data.proposalLine}` : null,
    data.productMessage ? `- Message produit : ${data.productMessage}` : null,
    "L'athlète ouvre le brief du matin. Explique ces chiffres SharpIt (réserve, stress, cible) et la séance — pas de diagnostic médical. Ne recharge pas ces scores par outil.",
  ];
  return ['## Conversation ouverte depuis le brief du matin', ...lines].filter(Boolean).join('\n');
}

function sessionLineFromPlanned(session: {
  type: string;
  title: string | null;
  durationMin: number | null;
  intensity: string | null;
  startTime: string | null;
}): string {
  const typeLabel =
    activityTypeLabels[session.type as keyof typeof activityTypeLabels] ?? session.type;
  const intensity = session.intensity
    ? (intensityLabels[session.intensity as keyof typeof intensityLabels] ?? session.intensity)
    : null;
  const duration = session.durationMin ? formatPlannedDuration(session.durationMin) : null;
  return joinBits([
    session.title?.trim() || typeLabel,
    intensity,
    duration,
    session.startTime ? `à ${session.startTime}` : null,
  ]);
}

/** Loads everything the morning-brief discuss block needs — deterministic, no LLM. */
export async function loadMorningBriefDiscussData(
  athleteId: string,
  trainingDayId: string,
  now: Date = new Date(),
): Promise<MorningBriefDiscussData> {
  const dayStart = new Date(`${trainingDayId}T00:00:00`);
  const dayEnd = new Date(`${trainingDayId}T23:59:59.999`);

  const [scores, snapshot, sessions, recalibration] = await Promise.all([
    loadV1DayScores(athleteId, trainingDayId, now),
    getOrBuildAthleteSnapshot(athleteId, trainingDayId),
    getPlannedSessions(athleteId, { from: dayStart, to: dayEnd }),
    ensureMorningRecalibration(athleteId, trainingDayId).catch(() => null),
  ]);

  const verdict = (snapshot.todaysDecision ??
    snapshot.decision?.overallVerdict ??
    null) as OverallVerdict | null;
  const verdictLabel = verdict ? (mapVerdictToDisplay(verdict)?.label ?? null) : null;

  const openSession = sessions.find((s) => !s.completed) ?? sessions[0] ?? null;
  const proposal = recalibration?.presentation as
    MorningRecalibrationPresentation | null | undefined;

  return {
    trainingDayId,
    verdictLabel,
    scores,
    readiness: snapshot.readiness ?? null,
    sessionLine: openSession ? sessionLineFromPlanned(openSession) : null,
    proposalLine: proposalLineFromPresentation(proposal),
    productMessage: snapshot.primaryProductMessage?.trim() || null,
  };
}

export async function loadMorningBriefDiscussBlock(
  athleteId: string,
  trainingDayId: string,
  now: Date = new Date(),
): Promise<string> {
  const data = await loadMorningBriefDiscussData(athleteId, trainingDayId, now);
  return formatMorningBriefDiscussBlock(data);
}

export function formatTodayDiscussDataBlock(input: {
  trainingDayId: string;
  scores: V1DayScores;
  readiness: number | null;
  sleepNeededMin: number | null;
  sessionLine: string | null;
}): string {
  const lines: Line[] = [
    `Jour : ${input.trainingDayId}.`,
    ...formatDayScoresDiscussLines({
      scores: input.scores,
      readiness: input.readiness,
      sleepNeededMin: input.sleepNeededMin,
    }),
    input.sessionLine
      ? `- Séance du jour : ${input.sessionLine}`
      : '- Séance du jour : aucune planifiée.',
    "L'athlète parle de son état du jour depuis Aujourd'hui. Appuie-toi sur ces chiffres SharpIt (réserve, stress, cible, sommeil nécessaire) et la séance — pas de diagnostic médical. Ne les recharge pas par outil.",
  ];
  return ["## Conversation ouverte depuis Aujourd'hui", ...lines].filter(Boolean).join('\n');
}

/** Data-driven Today discuss block (ADR-079 scores + sleep needed). */
export async function loadTodayDiscussBlock(
  athleteId: string,
  trainingDayId: string,
  now: Date = new Date(),
): Promise<string> {
  const data = await loadMorningBriefDiscussData(athleteId, trainingDayId, now);
  const healthEntries = await getHealthEntries(
    athleteId,
    14,
    new Date(`${trainingDayId}T12:00:00`),
  );
  const sleepCoach = analyzeSleep(toSleepEntryInputs(healthEntries));

  return formatTodayDiscussDataBlock({
    trainingDayId,
    scores: data.scores,
    readiness: data.readiness,
    sleepNeededMin: sleepCoach.hasData ? sleepCoach.sleepNeededMin : null,
    sessionLine: data.sessionLine,
  });
}
