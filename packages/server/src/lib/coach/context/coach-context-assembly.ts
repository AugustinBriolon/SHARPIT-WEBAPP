/**
 * The coach context's data: the sources read into the athlete's state, section by section.
 * Pure: no I/O, the sources come in loaded.
 */
import { differenceInCalendarDays, format, startOfDay, subDays } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import { fr } from 'date-fns/locale';
import {
  getTrainingZoneNotes,
  getActivitiesForCoach,
  getAthleteProfile,
  getGoals,
  getHealthEntries,
  getPlannedSessionsForCoach,
} from '@sharpit/server/lib/queries';
import {
  loadAthletePmcAnchor,
  loadDailyTrainingStressEntries,
} from '@sharpit/server/lib/training/pmc/pmc-server';
import { pmcTsb } from '@sharpit/app/lib/training/pmc/pmc';
import {
  categoryLabels,
  sideLabels,
  statusLabels,
} from '@sharpit/app/lib/physical-health/physical';
import {
  FUNCTIONAL_IMPACT_LABELS,
  ZONE_STRATEGY_LABELS,
  zoneStrategy,
} from '@sharpit/app/lib/physical-health/zone-follow-up';
import type { TrainingZone } from '@sharpit/app/lib/physical-health/zone-training-rules';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import { listTravelContexts } from '@sharpit/server/lib/travel-context/service';
import { toUtcDateOnly } from '@sharpit/app/lib/travel-context/calendar-date';
import { buildTopActionLine } from '@sharpit/app/lib/today/rich/today-rich-view';
import { decisionVerdict } from '@sharpit/app/lib/decision/projection';
import { resolve, resolveCode } from '@sharpit/app/lib/french';
import { computeTrainingLoad } from '@sharpit/server/lib/training/load/training-load';
import { buildEnvironmentPresentationContext } from '@sharpit/server/lib/presentation/environment/environment';
import { formatScenarioComparisonForCoach } from '@sharpit/server/lib/presentation/scenario/scenario-comparison';
import {
  ACTIVITY_STATUS_OPTIONS,
  type ActivityStatusId,
  type ActivityStatusStore,
} from '@sharpit/app/lib/health/activity-status';
import { normalizeAthleteEquipment } from '@sharpit/app/lib/equipment/parse';
import { normalizeAthletePracticedSports } from '@sharpit/app/lib/practiced-sports';
import { normalizeTrainingAvailability } from '@sharpit/server/lib/training-availability/parse';
import { WEEKDAY_LABELS_FR } from '@sharpit/app/lib/training-availability/types';
import { dayKeyFromDate, toLocalCalendarDate } from '@sharpit/app/lib/date/day-key';
import type {
  CoachContextSources,
  loadHomeWeatherHint,
} from '@sharpit/server/lib/coach/context/coach-context-sources';

export const TYPE_FR: Record<string, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
  STRENGTH: 'Renfo',
};

export function formatPace(secPerKm?: number | null): string | null {
  if (secPerKm === undefined || secPerKm === null || secPerKm <= 0) {
    return null;
  }
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

export function formatMin(seconds?: number | null): string {
  if (!seconds) {
    return '—';
  }
  return `${Math.round(seconds / 60)} min`;
}

function relativeActivityDay(activityDate: Date, today: Date): string | null {
  const diff = differenceInCalendarDays(today, startOfDay(activityDate));
  if (diff === 0) {
    return "aujourd'hui";
  }
  if (diff === 1) {
    return 'hier';
  }
  return null;
}

export type CoachActivity = Awaited<ReturnType<typeof getActivitiesForCoach>>[number];

function appendRunDetailParts(a: CoachActivity, parts: string[]): void {
  if (!a.runMetrics) {
    return;
  }
  if (a.runMetrics.distanceM) {
    parts.push(`${(a.runMetrics.distanceM / 1000).toFixed(1)} km`);
  }
  const pace = formatPace(a.runMetrics.paceSecPerKm);
  if (pace) {
    parts.push(pace);
  }
  if (a.runMetrics.avgHr) {
    parts.push(`${a.runMetrics.avgHr} bpm`);
  }
}

function appendBikeDetailParts(a: CoachActivity, parts: string[]): void {
  if (!a.bikeMetrics) {
    return;
  }
  if (a.bikeMetrics.avgPower) {
    parts.push(`${Math.round(a.bikeMetrics.avgPower)} W`);
  }
  if (a.bikeMetrics.normalizedPower) {
    parts.push(`NP ${Math.round(a.bikeMetrics.normalizedPower)}`);
  }
  if (a.bikeMetrics.tss) {
    parts.push(`TSS ${Math.round(a.bikeMetrics.tss)}`);
  }
}

function appendStrengthDetailParts(a: CoachActivity, parts: string[]): void {
  if (a.type !== 'STRENGTH' || !a.strengthSets.length) {
    return;
  }
  const exos = a.strengthSets
    .slice(0, 5)
    .map((s) => {
      const w = isSet(s.weightKg) ? ` ${s.weightKg}kg` : '';
      return `${s.exercise} ${s.sets}x${s.reps}${w}`;
    })
    .join(', ');
  parts.push(exos);
}

function activityDetailParts(a: CoachActivity): string[] {
  const parts: string[] = [];
  appendRunDetailParts(a, parts);
  appendBikeDetailParts(a, parts);
  if (a.swimMetrics?.distanceM) {
    parts.push(`${a.swimMetrics.distanceM} m`);
  }
  appendStrengthDetailParts(a, parts);
  return parts;
}

export function mapActivityForCoachRecent(a: CoachActivity, today: Date) {
  return {
    date: format(a.date, 'EEE d MMM', { locale: fr }),
    relativeDay: relativeActivityDay(a.date, today),
    type: TYPE_FR[a.type] ?? a.type,
    title: a.title ?? '',
    duration: formatMin(a.duration),
    load: isSet(a.load) ? Math.round(a.load) : null,
    rpe: a.rpe,
    feeling: a.feeling ?? null,
    detail: activityDetailParts(a).join(' · '),
  };
}

/**
 * Construit un résumé compact et structuré de l'état de l'athlète, destiné à
 * être injecté dans le prompt du Coach IA. On garde un volume de tokens faible
 * (synthèse, pas de données brutes) → coût minimal et meilleures réponses.
 */
function averageNumeric(vals: (number | null | undefined)[]): number | null {
  const ok = vals.filter((v): v is number => isSet(v) && v !== undefined);
  return ok.length ? Math.round(ok.reduce((s, v) => s + v, 0) / ok.length) : null;
}

function buildHealthAverages(last7: Awaited<ReturnType<typeof getHealthEntries>>) {
  return {
    avgSleepMin: averageNumeric(last7.map((h) => h.sleepMinutes)),
    avgHrv: averageNumeric(last7.map((h) => h.hrv)),
    avgRestingHr: averageNumeric(last7.map((h) => h.restingHr)),
    avgReadiness: averageNumeric(last7.map((h) => h.recoveryScore)),
  };
}

function buildTodayReadinessFields(
  todayHealth: Awaited<ReturnType<typeof getHealthEntries>>[number] | undefined,
) {
  return {
    readinessToday: todayHealth?.recoveryScore ?? null,
    readinessLevel: todayHealth?.readinessLevel ?? null,
  };
}

function buildTodayAutonomicFields(
  todayHealth: Awaited<ReturnType<typeof getHealthEntries>>[number] | undefined,
) {
  return {
    hrvStatus: todayHealth?.hrvStatus ?? null,
    bodyBattery: todayHealth?.bodyBattery ?? null,
  };
}

function buildTodayHealthFields(
  todayHealth: Awaited<ReturnType<typeof getHealthEntries>>[number] | undefined,
) {
  return {
    ...buildTodayReadinessFields(todayHealth),
    ...buildTodayAutonomicFields(todayHealth),
  };
}

function buildHealthFromEntries(healthEntries: Awaited<ReturnType<typeof getHealthEntries>>) {
  const last7 = healthEntries.slice(0, 7);
  return {
    ...buildTodayHealthFields(healthEntries[0]),
    ...buildHealthAverages(last7),
  };
}

function buildGoalsContext(goals: Awaited<ReturnType<typeof getGoals>>, today: Date) {
  const activeGoals = goals.filter((g) => !g.achieved);
  const races = activeGoals
    .filter((g) => g.kind === 'RACE' && g.targetDate)
    .map((g) => ({
      title: g.title,
      date: g.targetDate!,
      location: g.location,
      priority: g.priority,
      raceFormat: g.raceFormat,
      targetPerformance: g.targetPerformance,
      daysToGo: differenceInCalendarDays(new Date(g.targetDate!), today),
    }))
    .filter((g) => g.daysToGo >= 0)
    .sort((a, b) => a.daysToGo - b.daysToGo);
  return {
    primaryRace: races.find((r) => r.priority === 'A') ?? races[0] ?? null,
    races,
    metricGoals: activeGoals
      .filter((g) => g.kind === 'METRIC')
      .map((g) => ({
        title: g.title,
        current: g.currentValue,
        target: g.targetValue,
        unit: g.unit,
      })),
  };
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  PAIN: 'Douleur',
  INJURY: 'Blessure',
  MOBILITY_LIMITATION: 'Mobilité',
  POSTURE_ISSUE: 'Posture',
  DISCOMFORT: 'Gêne',
  MUSCULAR_TIGHTNESS: 'Raideur musculaire',
  JOINT_STIFFNESS: 'Raideur articulaire',
  INSTABILITY: 'Instabilité',
  RECURRING_PHYSICAL: 'Récidive',
  OTHER: 'Autre',
};

const TREND_LABELS: Record<string, string> = {
  IMPROVING: 'en amélioration',
  WORSENING: 'en aggravation',
  STABLE: 'stable',
};

export function legacyPhysicalTrend(
  checkins: Awaited<ReturnType<typeof getTrainingZoneNotes>>[number]['checkins'],
): string | null {
  // Status changes carry no reading: the trend compares the last two readings only.
  const readings = checkins.filter((checkin) => isSet(checkin.severity));
  if (readings.length < 2) {
    return null;
  }
  const last = readings[0]?.severity;
  const prev = readings[1]?.severity;
  if (!isSet(last) || !isSet(prev)) {
    return null;
  }
  if (last < prev) {
    return 'en amélioration';
  }
  if (last > prev) {
    return 'en aggravation';
  }
  return 'stable';
}

type PhysicalNotes = Awaited<ReturnType<typeof getTrainingZoneNotes>>;

function declaredPhysicalEntry(note: PhysicalNotes[number], now: Date) {
  return {
    type: note.category as string,
    category: categoryLabels[note.category],
    status: statusLabels[note.status],
    title: note.title,
    bodyPart: note.bodyPart,
    side: note.side !== 'NA' ? sideLabels[note.side] : null,
    severity: note.severity,
    description: note.description,
    trend: legacyPhysicalTrend(note.checkins),
    functionalCapacity: note.functionalImpact
      ? (FUNCTIONAL_IMPACT_LABELS[note.functionalImpact] ?? null)
      : null,
    confidence: null as number | null,
    strategy: ZONE_STRATEGY_LABELS[zoneStrategy(note, now)] as string | null,
    source: 'declared' as const,
  };
}

/**
 * The physical conditions the coach reads. `category` is the French label for the prompt;
 * `type` keeps the raw kind (PAIN, INJURY…), which `sensitiveZonesFrom` needs to turn a
 * pain or an injury into a zone the plans must spare — reading the label, it found none.
 *
 * The athlete's declaration wins (ADR-068): the snapshot's inferred conditions only stand in
 * when nothing is declared — they lagged behind it, and missed every zone declared after the
 * Phase 1 migration.
 */
export function buildPhysicalContext(
  athleteSnapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
  physicalNotes: PhysicalNotes,
  now = new Date(),
) {
  const declared = physicalNotes.filter((note) => note.status !== 'RESOLVED');
  if (declared.length > 0) {
    return declared.map((note) => declaredPhysicalEntry(note, now));
  }

  return (
    athleteSnapshot.physicalHealth?.conditions
      .filter((c) => c.affectsTraining && c.status !== 'RESOLVED')
      .map((c) => ({
        type: c.type as string,
        category: CONDITION_TYPE_LABELS[c.type] ?? c.type,
        status: c.status as string,
        title: c.label,
        bodyPart: c.bodyRegion,
        side: c.side !== 'NA' ? sideLabels[c.side] : null,
        severity: c.severity,
        description: null as string | null,
        trend: TREND_LABELS[c.trend] ?? null,
        functionalCapacity: c.functionalCapacity as string | null,
        confidence: c.confidence as number | null,
        strategy: null as string | null,
        source: 'inferred' as const,
      })) ?? []
  );
}

/** The declared zones as plan and adapt generation reads them (`formatZoneTrainingRules`). */
export function buildTrainingZones(physicalNotes: PhysicalNotes): TrainingZone[] {
  return physicalNotes.map((note) => ({
    title: note.title,
    bodyPart: note.bodyPart,
    side: note.side,
    description: note.description,
    category: note.category,
    status: note.status,
    severity: note.severity,
    functionalImpact: note.functionalImpact,
    affectsTraining: note.affectsTraining,
    resolvedAt: note.resolvedAt,
    checkins: note.checkins,
  }));
}

function buildTravelMemory(
  travelContexts: Awaited<ReturnType<typeof listTravelContexts>>,
  refDate: Date,
) {
  const utcToday = toUtcDateOnly(refDate);
  const utcPlanHorizon = subDays(utcToday, -21);
  const memoryEntriesInWindow = travelContexts.filter(
    (t) => t.startDate <= utcPlanHorizon && t.endDate >= utcToday,
  );
  const mapEntry = (t: (typeof memoryEntriesInWindow)[number]) => ({
    label: t.label,
    locationLabel: t.locationLabel,
    startDate: t.startDate.toISOString().slice(0, 10),
    endDate: t.endDate.toISOString().slice(0, 10),
    isActiveNow: t.startDate <= utcToday && t.endDate >= utcToday,
    note: t.note,
    trainingConstraint: t.trainingConstraint,
    allowedDisciplines: t.allowedDisciplines,
  });
  return {
    travel: memoryEntriesInWindow.filter((t) => t.type === 'TRAVEL').map(mapEntry),
    constraints: memoryEntriesInWindow.filter((t) => t.type === 'CONSTRAINT').map(mapEntry),
  };
}

function buildCoachDecision(
  athleteSnapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
) {
  const decisionRaw = athleteSnapshot.decision;
  if (!decisionRaw) {
    return null;
  }
  return {
    verdict: decisionVerdict(decisionRaw),
    headline: decisionRaw.primaryDecision.headlineCode
      ? resolveCode(decisionRaw.primaryDecision.headlineCode)
      : null,
    topAction: buildTopActionLine(decisionRaw.topAction),
    rationale: decisionRaw.topAction?.rationaleCode
      ? resolveCode(decisionRaw.topAction.rationaleCode)
      : null,
    limitingFactorDomain: decisionRaw.limitingFactor.domain,
    limitingFactorDescription: decisionRaw.limitingFactor.description
      ? resolve(decisionRaw.limitingFactor.description)
      : null,
    confidence: decisionRaw.confidence,
    confidenceTier: decisionRaw.confidenceTier,
    attentionDomain: decisionRaw.priority.attentionDomain,
    physiologicalConsistency: decisionRaw.physiologicalConsistency,
    consistencyScore: decisionRaw.consistencyScore,
    criticalEvidence: decisionRaw.supportingEvidence.find((e) => e.severity === 'CRITICAL'),
    primaryConflict: decisionRaw.conflicts[0] ?? null,
    primaryOpportunity: decisionRaw.opportunities[0] ?? null,
    adviceActionable: athleteSnapshot.adviceActionable,
    prescriptiveAdviceAllowed: isSet(athleteSnapshot.todaysDecision),
  };
}

function buildCoachFatigueSnapshot(
  athleteSnapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
) {
  const fatigueSnapshot = athleteSnapshot.fatigue;
  if (!fatigueSnapshot) {
    return null;
  }
  return {
    fatigueIndex: fatigueSnapshot.fatigueIndex ?? null,
    fatigueLevel: fatigueSnapshot.fatigueLevel,
    trainingCapacity: fatigueSnapshot.trainingCapacity,
    trajectory: fatigueSnapshot.trajectory,
    primaryLimitingFactor: fatigueSnapshot.primaryLimitingFactor ?? null,
    functionalOverreachingRisk: fatigueSnapshot.signals.functionalOverreachingRisk,
    estimatedTimeToFresh: fatigueSnapshot.estimatedTimeToFresh ?? null,
    performanceImpairmentEstimate: fatigueSnapshot.performanceImpairmentEstimate,
    confidence: fatigueSnapshot.confidence,
  };
}

function buildCoachAdaptationSnapshot(
  athleteSnapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
) {
  const adaptationSnapshot = athleteSnapshot.adaptation;
  if (!adaptationSnapshot) {
    return null;
  }
  return {
    adaptationIndex: adaptationSnapshot.adaptationIndex ?? null,
    adaptationStatus: adaptationSnapshot.adaptationStatus,
    adaptationTrend: adaptationSnapshot.adaptationTrend,
    limitingFactor: adaptationSnapshot.limitingFactor ?? null,
    estimatedAdaptationPeak: adaptationSnapshot.estimatedAdaptationPeak ?? null,
    plateauRisk: adaptationSnapshot.plateauRisk,
    overreachingWithoutAdaptationDetected: adaptationSnapshot.overreachingWithoutAdaptationDetected,
    confidence: adaptationSnapshot.confidence,
  };
}

function buildCoachIntelligence(
  athleteSnapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
) {
  return {
    fatigue: buildCoachFatigueSnapshot(athleteSnapshot),
    adaptation: buildCoachAdaptationSnapshot(athleteSnapshot),
    decision: buildCoachDecision(athleteSnapshot),
  };
}

function resolveCoachHomeLabel(
  profile: Awaited<ReturnType<typeof getAthleteProfile>>,
): string | null {
  return (
    profile?.homeLocationLabel?.trim() || (isSet(profile?.homeLocationLat) ? 'Domicile' : null)
  );
}

function environmentAdjustmentFields(
  athleteSnapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
) {
  return {
    recoveryDemandAdjustment: athleteSnapshot.environment?.recoveryDemandAdjustment ?? null,
    performanceAdjustment: athleteSnapshot.environment?.performanceAdjustment ?? null,
  };
}

function buildCoachEnvironment(
  profile: Awaited<ReturnType<typeof getAthleteProfile>>,
  athleteSnapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
  homeWeather: Awaited<ReturnType<typeof loadHomeWeatherHint>>,
) {
  const envPresentation = buildEnvironmentPresentationContext(athleteSnapshot.environment);
  return {
    homeLabel: resolveCoachHomeLabel(profile),
    thermalLabel: envPresentation.thermalLabel,
    summaryLine: envPresentation.summaryLine,
    detailLine: envPresentation.detailLine,
    trainingImpact: envPresentation.trainingImpact,
    airTemperatureC: homeWeather?.airTemperatureC ?? null,
    relativeHumidityPct: homeWeather?.relativeHumidityPct ?? null,
    ...environmentAdjustmentFields(athleteSnapshot),
  };
}

function buildAvailableDays(
  activities: Awaited<ReturnType<typeof getActivitiesForCoach>>,
  today: Date,
): string[] {
  const since = subDays(today, 56);
  const dayCounts = new Array(7).fill(0);
  for (const activity of activities) {
    if (activity.date >= since) {
      dayCounts[new Date(activity.date).getDay()] += 1;
    }
  }
  return dayCounts
    .map((count, day) => ({ day, count }))
    .filter((entry) => entry.count >= 8 * 0.25)
    .map((entry) => WEEKDAY_LABELS_FR[entry.day]!);
}

function mapRealizedSession(
  planned: Awaited<ReturnType<typeof getPlannedSessionsForCoach>>[number],
) {
  const analysis = planned.analysis as {
    complianceScore?: number;
    verdict?: string;
    summary?: string;
  };
  return {
    date: format(toLocalCalendarDate(planned.date), 'EEE d MMM', { locale: fr }),
    type: TYPE_FR[planned.type] ?? planned.type,
    title: planned.title ?? '',
    score: analysis.complianceScore ?? null,
    verdict: analysis.verdict ?? null,
    summary: analysis.summary ?? null,
  };
}

function mapUpcomingPlanned(
  planned: Awaited<ReturnType<typeof getPlannedSessionsForCoach>>[number],
) {
  return {
    id: planned.id,
    date: format(toLocalCalendarDate(planned.date), 'EEE d MMM', { locale: fr }),
    dateIso: dayKeyFromDate(planned.date),
    type: TYPE_FR[planned.type] ?? planned.type,
    title: planned.title ?? '',
    intensity: planned.intensity,
    durationMin: planned.durationMin,
    startTime: planned.startTime ?? null,
    locationLabel: planned.locationLabel ?? null,
    brickGroupId: planned.brickGroupId ?? null,
    brickOrder: planned.brickOrder ?? null,
  };
}

function buildCoachProfile(profile: Awaited<ReturnType<typeof getAthleteProfile>>) {
  if (!profile) {
    return null;
  }
  return {
    ftpW: profile.ftpW,
    maxHr: profile.maxHr,
    lthr: profile.lthr,
    thresholdPace: formatPace(profile.runThresholdPaceSecPerKm),
    vo2maxRunning: profile.vo2maxRunning,
    vo2maxCycling: profile.vo2maxCycling,
  };
}

function buildFitnessContext(
  anchor: Awaited<ReturnType<typeof loadAthletePmcAnchor>>,
  dailyStress: Awaited<ReturnType<typeof loadDailyTrainingStressEntries>>,
  refDate: Date,
) {
  const fitness = anchor
    ? { ctl: Math.round(anchor.ctl), atl: Math.round(anchor.atl), tsb: Math.round(pmcTsb(anchor)) }
    : { ctl: 0, atl: 0, tsb: 0 };
  return { fitness, load: computeTrainingLoad(dailyStress, refDate) };
}

function assembleCoachActivitySections(
  today: Date,
  activities: CoachContextSources[0],
  planned: CoachContextSources[3],
  pastPlanned: CoachContextSources[4],
) {
  return {
    availableDays: buildAvailableDays(activities, today),
    recent: activities.slice(0, 14).map((a) => mapActivityForCoachRecent(a, today)),
    realizedSessions: pastPlanned.filter((p) => p.completed && p.analysis).map(mapRealizedSession),
    upcomingPlanned: planned.map(mapUpcomingPlanned),
  };
}

/** Free-text athlete note — blank and absent both read as nothing to say. */
function coachProfileNote(profile: CoachContextSources[5]): string | null {
  return profile?.context?.trim() || null;
}

/**
 * The declared inventories, each normalised from its own JSON blob. Kept apart
 * from the section builder: three optional chains plus their fallbacks is most
 * of a function's complexity budget on their own.
 */
function coachProfileInventories(profile: CoachContextSources[5]) {
  return {
    equipment: normalizeAthleteEquipment(profile?.equipment ?? null),
    practicedSports: normalizeAthletePracticedSports(profile?.practicedSports ?? null).sports,
    trainingAvailability: normalizeTrainingAvailability(profile?.trainingAvailability ?? null),
  };
}

function assembleCoachProfileSections(
  today: Date,
  profile: CoachContextSources[5],
  healthEntries: CoachContextSources[1],
  goals: CoachContextSources[2],
) {
  const health = buildHealthFromEntries(healthEntries);
  const { primaryRace, races, metricGoals } = buildGoalsContext(goals, today);
  return {
    today: format(today, 'EEEE d MMMM yyyy', { locale: fr }),
    note: coachProfileNote(profile),
    ...coachProfileInventories(profile),
    profile: buildCoachProfile(profile),
    health,
    primaryRace,
    races,
    metricGoals,
  };
}

/** Compact activity-status payload for the coach prompt (presentation, not Core). */
export type CoachActivityStatus = {
  status: ActivityStatusId;
  label: string;
  planningImpact: string;
  retentionSummary: string | null;
};

export function buildCoachActivityStatus(store: ActivityStatusStore): CoachActivityStatus {
  const option =
    ACTIVITY_STATUS_OPTIONS.find((entry) => entry.id === store.status) ??
    ACTIVITY_STATUS_OPTIONS[0];
  return {
    status: store.status,
    label: option.label,
    planningImpact: option.planningImpact,
    retentionSummary:
      store.status !== 'active' && store.retention.kind === 'until_date'
        ? `jusqu’au ${store.retention.untilDate}`
        : null,
  };
}

export function assembleCoachContextPayload(
  today: Date,
  sources: CoachContextSources,
  refDate: Date,
) {
  const [
    activities,
    healthEntries,
    goals,
    planned,
    pastPlanned,
    profile,
    physicalNotes,
    athleteSnapshot,
    travelContexts,
    homeWeather,
    scenarioComparison,
    anchor,
    dailyStress,
    nutritionToday,
    activityStatusStore,
  ] = sources;

  const { fitness, load } = buildFitnessContext(anchor, dailyStress, refDate);
  const activitySections = assembleCoachActivitySections(today, activities, planned, pastPlanned);
  const profileSections = assembleCoachProfileSections(today, profile, healthEntries, goals);
  const environment = buildCoachEnvironment(profile, athleteSnapshot, homeWeather);
  const physical = buildPhysicalContext(athleteSnapshot, physicalNotes, refDate);
  const trainingZones = buildTrainingZones(physicalNotes);
  const { travel, constraints } = buildTravelMemory(travelContexts, refDate);
  const { fatigue, adaptation, decision } = buildCoachIntelligence(athleteSnapshot);

  return {
    ...profileSections,
    fitness,
    load,
    ...activitySections,
    travel,
    constraints,
    physical,
    trainingZones,
    fatigue,
    adaptation,
    decision,
    environment,
    scenarioComparison: formatScenarioComparisonForCoach(scenarioComparison),
    nutrition: nutritionToday,
    activityStatus: buildCoachActivityStatus(activityStatusStore),
  };
}

/** The athlete's state as the coach reads it, before it is written as prompt text. */
export type CoachContextData = ReturnType<typeof assembleCoachContextPayload>;
