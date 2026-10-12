/**
 * Coach system-prompt blocks naming what a contextual conversation is about.
 * Each loader reads its target through an athlete-scoped query: a foreign or
 * unknown id finds nothing and yields no block — never an error that would
 * reveal the id exists. Blocks stay short (name, date, key numbers); the full
 * athlete picture is already in the coach context above them.
 */

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Goal, PhysicalNote, PlannedSession } from '@prisma/client';
import {
  formatCoachActivityLine,
  formatMetricGoalLine,
  legacyPhysicalTrend,
} from '@sharpit/server/lib/coach/context/coach-context';
import { planningHorizonLabel } from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-context';
import { toLocalCalendarDate } from '@sharpit/app/lib/date/day-key';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import {
  categoryLabels,
  sideLabels,
  statusLabels,
} from '@sharpit/app/lib/physical-health/physical';
import { formatPlannedDuration, intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import {
  getActivityForCoach,
  getGoalById,
  getPhysicalNoteById,
  getPlannedSessionById,
} from '@sharpit/server/lib/queries';
import {
  findPersonalRecordDefinition,
  getPerformanceRecordPodium,
  getPerformanceRecordsForActivity,
} from '@sharpit/server/lib/training/records/records';
import { isSet } from '@sharpit/shared/value';

type Line = string | null | false | undefined;

const PROSE_MAX_CHARS = 240;

function joinBits(bits: Line[]): string {
  return bits.filter(Boolean).join(' · ');
}

function block(header: string, lines: Line[]): string {
  return [header, ...lines].filter(Boolean).join('\n');
}

function formatDay(date: Date): string {
  return format(date, 'EEEE d MMMM yyyy', { locale: fr });
}

function truncateProse(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > PROSE_MAX_CHARS ? `${trimmed.slice(0, PROSE_MAX_CHARS)}…` : trimmed;
}

// ── Today & planning ───────────────────────────────────────────────────────

/** Sync fallback; live discuss uses `loadTodayDiscussBlock` (ADR-079 scores). */
export function formatTodayDiscussBlock(): string {
  return block("## Conversation ouverte depuis Aujourd'hui", [
    "L'athlète parle de son état du jour. Appuie-toi d'abord sur la décision du jour, l'état de forme, la santé et la séance prévue aujourd'hui, déjà présents dans le contexte ci-dessus : ne les recharge pas par outil.",
  ]);
}

export { loadTodayDiscussBlock } from '@sharpit/server/lib/coach/chat/discuss/coach-discuss-day-scores';

/** The day's plate is in the context (« Nutrition du jour ») for today; another day is named. */
export function formatNutritionDiscussBlock(trainingDayId: string, today: Date): string {
  const isToday = trainingDayId === format(today, 'yyyy-MM-dd');
  const day = isToday
    ? "aujourd'hui"
    : format(parseISO(trainingDayId), 'EEEE d MMMM', { locale: fr });
  return block('## Conversation ouverte depuis Nutrition', [
    `L'athlète parle de sa nutrition (${day}) : apports, répartition des macros, objectifs, régime déclaré, carburant autour des séances. Appuie-toi sur « Nutrition du jour », le régime et les séances du contexte ; ne parle de l'état de forme que s'il éclaire l'alimentation.`,
  ]);
}

export function formatPlanningDiscussBlock(horizonDays: number, today: Date): string {
  const until = format(addDays(today, horizonDays), 'EEEE d MMMM', { locale: fr });
  return block('## Conversation ouverte depuis Ma semaine', [
    `Fenêtre discutée : ${planningHorizonLabel(horizonDays)} (jusqu'au ${until}). Raisonne sur « Déjà planifié » et l'agenda ci-dessus pour cette fenêtre ; n'appelle listPlannedSessions que pour aller au-delà.`,
  ]);
}

// ── Planned session ─────────────────────────────────────────────────────────

type DiscussedPlannedSession = Pick<
  PlannedSession,
  | 'id'
  | 'type'
  | 'date'
  | 'title'
  | 'startTime'
  | 'durationMin'
  | 'intensity'
  | 'load'
  | 'description'
  | 'completed'
  | 'analysis'
  | 'activityId'
>;

function plannedSessionSummary(session: DiscussedPlannedSession): string {
  return joinBits([
    `${activityTypeLabels[session.type]} ${session.title?.trim() ?? ''}`.trim(),
    formatDay(toLocalCalendarDate(session.date)),
    session.startTime && `à ${session.startTime}`,
    isSet(session.durationMin) && formatPlannedDuration(session.durationMin),
    session.intensity && intensityLabels[session.intensity],
    isSet(session.load) && `charge prévue ${Math.round(session.load)}`,
  ]);
}

function complianceScore(analysis: unknown): number | null {
  if (!analysis || typeof analysis !== 'object') {
    return null;
  }
  const score = (analysis as { complianceScore?: unknown }).complianceScore;
  return typeof score === 'number' ? Math.round(score) : null;
}

function plannedSessionOutcome(session: DiscussedPlannedSession): string | null {
  if (!session.completed && !session.activityId) {
    return null;
  }
  const score = complianceScore(session.analysis);
  return isSet(score) ? `Réalisée · conformité ${score}/100.` : 'Réalisée.';
}

export function formatPlannedSessionDiscussBlock(session: DiscussedPlannedSession): string {
  const prose = truncateProse(session.description);
  return block('## Séance prévue discutée (conversation ouverte depuis cette séance)', [
    plannedSessionSummary(session),
    `id=${session.id} : utilise cet id si tu proposes de la modifier ou de la supprimer.`,
    prose && `Contenu prévu : ${prose}`,
    plannedSessionOutcome(session),
  ]);
}

export async function loadPlannedSessionDiscussBlock(
  athleteId: string,
  sessionId: string,
): Promise<string | null> {
  const session = await getPlannedSessionById(athleteId, sessionId);
  return session ? formatPlannedSessionDiscussBlock(session) : null;
}

// ── Activity ────────────────────────────────────────────────────────────────

type DiscussedActivity = NonNullable<Awaited<ReturnType<typeof getActivityForCoach>>>;

export function formatActivityDiscussBlock(
  activity: DiscussedActivity,
  recordLabels: readonly string[],
  today: Date,
): string {
  return block('## Séance réalisée discutée (conversation ouverte depuis cette séance)', [
    formatCoachActivityLine(activity, today),
    recordLabels.length > 0 && `Records personnels détenus : ${recordLabels.join(', ')}.`,
  ]);
}

export async function loadActivityDiscussBlock(
  athleteId: string,
  activityId: string,
  today: Date,
): Promise<string | null> {
  const [activity, records] = await Promise.all([
    getActivityForCoach(athleteId, activityId),
    getPerformanceRecordsForActivity(athleteId, activityId),
  ]);
  if (!activity) {
    return null;
  }
  return formatActivityDiscussBlock(
    activity,
    records.map((record) => record.label),
    today,
  );
}

// ── Goal ────────────────────────────────────────────────────────────────────

type DiscussedGoal = Pick<
  Goal,
  | 'title'
  | 'kind'
  | 'targetDate'
  | 'location'
  | 'achieved'
  | 'notes'
  | 'priority'
  | 'raceFormat'
  | 'targetPerformance'
  | 'currentValue'
  | 'targetValue'
  | 'unit'
>;

function goalDateBits(targetDate: Date | null, today: Date): Line[] {
  if (!targetDate) {
    return [];
  }
  const daysToGo = differenceInCalendarDays(targetDate, today);
  return [formatDay(targetDate), daysToGo >= 0 ? `dans ${daysToGo} jours` : 'date passée'];
}

function raceGoalLine(goal: DiscussedGoal, today: Date): string {
  return joinBits([
    `Course : ${goal.title}${goal.location ? ` (${goal.location})` : ''}`,
    ...goalDateBits(goal.targetDate, today),
    goal.priority && `priorité ${goal.priority}`,
    goal.raceFormat,
    goal.targetPerformance && `objectif visé : ${goal.targetPerformance}`,
  ]);
}

function metricGoalLine(goal: DiscussedGoal, today: Date): string {
  const line = formatMetricGoalLine({
    title: goal.title,
    current: goal.currentValue,
    target: goal.targetValue,
    unit: goal.unit,
  });
  return joinBits([line, ...goalDateBits(goal.targetDate, today)]);
}

export function formatGoalDiscussBlock(goal: DiscussedGoal, today: Date): string {
  const notes = truncateProse(goal.notes);
  return block('## Objectif discuté (conversation ouverte depuis cet objectif)', [
    goal.kind === 'RACE' ? raceGoalLine(goal, today) : metricGoalLine(goal, today),
    goal.achieved && 'Objectif déjà atteint.',
    notes && `Notes de l'athlète : ${notes}`,
  ]);
}

export async function loadGoalDiscussBlock(
  athleteId: string,
  goalId: string,
  today: Date,
): Promise<string | null> {
  const goal = await getGoalById(athleteId, goalId);
  return goal ? formatGoalDiscussBlock(goal, today) : null;
}

// ── Record ──────────────────────────────────────────────────────────────────

const RECORD_SPORT_TYPE = { run: 'RUN', bike: 'BIKE', swim: 'SWIM' } as const;

type RecordFamily = NonNullable<ReturnType<typeof findPersonalRecordDefinition>>;
type RecordPodium = Awaited<ReturnType<typeof getPerformanceRecordPodium>>;

function podiumLine(entry: RecordPodium[number]): string {
  const when = format(entry.activityDate, 'd MMM yyyy', { locale: fr });
  return `${entry.rank}. ${entry.displayValue} · ${entry.activityTitle?.trim() || 'séance sans titre'} · ${when}`;
}

export function formatRecordDiscussBlock(family: RecordFamily, podium: RecordPodium): string {
  const sport = activityTypeLabels[RECORD_SPORT_TYPE[family.group]];
  return block('## Record discuté (conversation ouverte depuis Performance)', [
    `${family.label} · ${sport.toLowerCase()} :`,
    ...podium.map(podiumLine),
  ]);
}

export async function loadRecordDiscussBlock(
  athleteId: string,
  categoryKey: string,
): Promise<string | null> {
  const family = findPersonalRecordDefinition(categoryKey);
  if (!family) {
    return null;
  }
  const podium = await getPerformanceRecordPodium(athleteId, categoryKey);
  return podium.length > 0 ? formatRecordDiscussBlock(family, podium) : null;
}

// ── Physical condition ──────────────────────────────────────────────────────

type DiscussedPhysicalNote = Pick<
  PhysicalNote,
  'title' | 'category' | 'status' | 'bodyPart' | 'side' | 'severity' | 'description' | 'startDate'
> & { checkins: Parameters<typeof legacyPhysicalTrend>[0] };

function physicalNoteZone(note: DiscussedPhysicalNote): string | null {
  if (!note.bodyPart) {
    return null;
  }
  return note.side !== 'NA'
    ? `zone ${note.bodyPart} (${sideLabels[note.side]})`
    : `zone ${note.bodyPart}`;
}

function physicalNoteSummary(note: DiscussedPhysicalNote): string {
  const trend = legacyPhysicalTrend(note.checkins);
  return joinBits([
    `${categoryLabels[note.category]} : ${note.title}`,
    physicalNoteZone(note),
    isSet(note.severity) && `sévérité ${note.severity}/10`,
    `statut ${statusLabels[note.status]}`,
    trend && `tendance ${trend}`,
    `depuis le ${format(note.startDate, 'd MMMM yyyy', { locale: fr })}`,
  ]);
}

export function formatPhysicalConditionDiscussBlock(note: DiscussedPhysicalNote): string {
  const prose = truncateProse(note.description);
  return block('## Contrainte physique discutée (conversation ouverte depuis Corps)', [
    physicalNoteSummary(note),
    prose && `Description de l'athlète : ${prose}`,
    "N'aggrave jamais cette zone ; les estimations SHARPIT ne sont jamais un diagnostic médical.",
  ]);
}

export async function loadPhysicalConditionDiscussBlock(
  athleteId: string,
  noteId: string,
): Promise<string | null> {
  const note = await getPhysicalNoteById(athleteId, noteId);
  return note ? formatPhysicalConditionDiscussBlock(note) : null;
}
