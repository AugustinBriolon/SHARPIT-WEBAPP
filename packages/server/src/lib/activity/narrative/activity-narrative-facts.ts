import { ActivityType } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { differenceInCalendarDays, startOfDay, subDays } from 'date-fns';
import { prisma } from '@sharpit/db/client';
import {
  buildEnvironmentFacts,
  buildPhysicalConditionFacts,
  buildPmcFacts,
  buildRecoveryContextFacts,
  buildThresholdPerformanceFacts,
  buildTrainingLoadFacts,
  type NarrativeActivityMetrics,
  type NarrativeAthleteProfile,
  type NarrativeHealthRow,
  type NarrativePhysicalNote,
} from '@sharpit/server/lib/activity/narrative/activity-narrative-athlete-context';
import {
  formatActivityWeatherNarrative,
  parseActivityWeather,
} from '@sharpit/app/lib/activity/weather/activity-weather';
import { isIndoorActivitySession } from '@sharpit/app/lib/activity/location/indoor-activity';
import { resolveActivityEnvironmentPresentation } from '@sharpit/server/lib/environment/activity-environment';
import { formatDistance, formatDuration } from '@sharpit/app/lib/format';
import {
  formatGoalDisplayValue,
  parseGoalMetricConfig,
} from '@sharpit/app/lib/goals/goal-metric-config';
import { resolveEnvironmentalExplanation } from '@sharpit/server/lib/presentation/environment/environment';
import { getActivePhysicalNotes, getAthleteProfile } from '@sharpit/server/lib/queries';
import { buildTechnicalSessionFacts } from '@sharpit/server/lib/activity/narrative/activity-narrative-technical-facts';
import { getCachedActivityStreams } from '@sharpit/server/lib/streams/streams';
import {
  loadAthletePmcAnchor,
  loadDailyTrainingStressEntries,
} from '@sharpit/server/lib/training/pmc/pmc-server';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

const TYPE_FR: Record<string, string> = {
  RUN: 'Course à pied',
  BIKE: 'Vélo',
  SWIM: 'Natation',
};

type PeerRow = {
  id: string;
  date: Date;
  duration: number | null;
  rpe: number | null;
  feeling: string | null;
  runMetrics: {
    distanceM: number | null;
    paceSecPerKm: number | null;
    avgHr: number | null;
    elevationM: number | null;
    cadence: number | null;
  } | null;
  bikeMetrics: {
    avgPower: number | null;
    elevationM: number | null;
    avgCadence: number | null;
  } | null;
  swimMetrics: {
    distanceM: number | null;
    avgPaceSecPer100m: number | null;
    swolf: number | null;
  } | null;
};

type ActivityRow = PeerRow & {
  type: ActivityType;
  title: string | null;
  weather: string | null;
  notes: string | null;
  load: number | null;
  observedLocationLat: number | null;
  observedLocationLng: number | null;
  observedLocationLabel: string | null;
};

function fmtPace(secPerKm?: number | null): string | null {
  if (secPerKm === undefined || secPerKm === null || secPerKm <= 0) {
    return null;
  }
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

function fmtPace100(secPer100m?: number | null): string | null {
  if (secPer100m === undefined || secPer100m === null || secPer100m <= 0) {
    return null;
  }
  const m = Math.floor(secPer100m / 60);
  const s = Math.round(secPer100m % 60);
  return `${m}:${s.toString().padStart(2, '0')}/100m`;
}

function avgHr(activity: PeerRow): number | null {
  return activity.runMetrics?.avgHr ?? null;
}

function paceSecPerKm(activity: PeerRow): number | null {
  return activity.runMetrics?.paceSecPerKm ?? null;
}

function distanceM(activity: PeerRow): number | null {
  return activity.runMetrics?.distanceM ?? activity.swimMetrics?.distanceM ?? null;
}

function avg(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function weatherFact(raw: string | null): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const parsed = parseActivityWeather(raw);
  if (parsed) {
    return `Météo : ${formatActivityWeatherNarrative(parsed)}`;
  }
  return `Météo : ${raw.trim()}`;
}

function activityEnvironmentLine(activity: ActivityRow): string | null {
  if (isIndoorActivitySession(activity)) {
    return 'Environnement : intérieur / virtual (pas de météo outdoor)';
  }
  return weatherFact(activity.weather);
}

function describeActivityCoreBits(activity: ActivityRow): string[] {
  return [
    `Sport : ${TYPE_FR[activity.type] ?? activity.type}`,
    activity.title ? `Titre : ${activity.title}` : null,
    `Date : ${activity.date.toISOString().slice(0, 10)}`,
    activity.duration ? `Durée : ${formatDuration(activity.duration)}` : null,
    isSet(activity.load) ? `Charge : ${Math.round(activity.load)} TSS` : null,
    isSet(activity.rpe) ? `RPE : ${activity.rpe}/10` : null,
    activity.feeling ? `Ressenti déclaré : ${activity.feeling}` : null,
    activityEnvironmentLine(activity),
    activity.notes ? `Notes athlète : ${activity.notes}` : null,
  ].filter(Boolean) as string[];
}

function appendDistanceAndPaceBits(bits: string[], activity: ActivityRow): void {
  const dist = distanceM(activity);
  if (dist) {
    bits.push(`Distance : ${formatDistance(dist)}`);
  }
  const pace = paceSecPerKm(activity);
  if (pace) {
    bits.push(`Allure moyenne : ${fmtPace(pace)}`);
  }
  const swimPace = fmtPace100(activity.swimMetrics?.avgPaceSecPer100m);
  if (swimPace) {
    bits.push(`Allure moyenne : ${swimPace}`);
  }
  if (isSet(activity.swimMetrics?.swolf)) {
    bits.push(`SWOLF : ${Math.round(activity.swimMetrics.swolf)}`);
  }
}

function appendHrBit(
  bits: string[],
  activity: ActivityRow,
  extras?: { streamAvgHr?: number | null },
): void {
  const hr = avgHr(activity) ?? extras?.streamAvgHr ?? null;
  if (hr) {
    bits.push(`FC moyenne : ${Math.round(hr)} bpm`);
  }
}

function appendCadenceBits(bits: string[], activity: ActivityRow): void {
  if (isSet(activity.runMetrics?.cadence)) {
    bits.push(`Cadence : ${Math.round(activity.runMetrics.cadence)} spm`);
  }
  if (isSet(activity.bikeMetrics?.avgCadence)) {
    bits.push(`Cadence : ${Math.round(activity.bikeMetrics.avgCadence)} rpm`);
  }
}

function appendHrAndCadenceBits(
  bits: string[],
  activity: ActivityRow,
  extras?: { streamAvgHr?: number | null },
): void {
  appendHrBit(bits, activity, extras);
  appendCadenceBits(bits, activity);
}

function appendPowerAndElevationBits(bits: string[], activity: ActivityRow): void {
  if (activity.bikeMetrics?.avgPower) {
    bits.push(`Puissance moyenne : ${Math.round(activity.bikeMetrics.avgPower)} W`);
  }
  const elevation = activity.runMetrics?.elevationM ?? activity.bikeMetrics?.elevationM;
  if (elevation) {
    bits.push(`D+ : ${Math.round(elevation)} m`);
  }
}

function appendPerformanceMetricBits(
  bits: string[],
  activity: ActivityRow,
  extras?: { streamAvgHr?: number | null },
): void {
  appendDistanceAndPaceBits(bits, activity);
  appendHrAndCadenceBits(bits, activity, extras);
  appendPowerAndElevationBits(bits, activity);
}

/** Faits séance : métriques brutes pour référence interne du modèle (ne pas tout répéter en prose). */
function describeActivity(activity: ActivityRow, extras?: { streamAvgHr?: number | null }): string {
  const bits = describeActivityCoreBits(activity);
  appendPerformanceMetricBits(bits, activity, extras);
  return bits.join('\n');
}

function comparePeerPaceLine(activity: ActivityRow, peers: PeerRow[]): string | null {
  const peerPaces = peers.map(paceSecPerKm).filter((v): v is number => isSet(v) && v > 0);
  const actPace = paceSecPerKm(activity);
  const avgPace = avg(peerPaces);
  if (!actPace || !avgPace) {
    return null;
  }
  const deltaPct = Math.round(((avgPace - actPace) / avgPace) * 100);
  if (deltaPct > 2) {
    return `- Allure plus rapide que la moyenne 30j (~${fmtPace(avgPace)}) d'environ ${deltaPct} %.`;
  }
  if (deltaPct < -2) {
    return `- Allure plus lente que la moyenne 30j (~${fmtPace(avgPace)}) d'environ ${Math.abs(deltaPct)} %.`;
  }
  return `- Allure proche de la moyenne 30j (~${fmtPace(avgPace)}).`;
}

function comparePeerHrLine(activity: ActivityRow, peers: PeerRow[]): string | null {
  const peerHrs = peers.map(avgHr).filter((v): v is number => isSet(v) && v > 0);
  const actHr = avgHr(activity);
  const avgHr30 = avg(peerHrs);
  if (!actHr || !avgHr30) {
    return null;
  }
  const diff = Math.round(actHr - avgHr30);
  if (Math.abs(diff) < 3) {
    return null;
  }
  return `- FC moyenne ${diff > 0 ? 'supérieure' : 'inférieure'} à la moyenne 30j (${Math.round(avgHr30)} bpm) d'environ ${Math.abs(diff)} bpm.`;
}

function comparePeerHrPeakLine(activity: ActivityRow, peers: PeerRow[]): string | null {
  const actHr = avgHr(activity);
  if (!actHr) {
    return null;
  }
  const lastHigher = peers.find((p) => {
    const hr = avgHr(p);
    return isSet(hr) && hr > actHr;
  });
  if (lastHigher) {
    const days = differenceInCalendarDays(startOfDay(activity.date), startOfDay(lastHigher.date));
    return `- FC moyenne la plus élevée depuis ${days} jour(s) (parmi les séances comparables récentes).`;
  }
  if (peers.length >= 2) {
    return '- FC moyenne la plus élevée sur la fenêtre 30 jours comparée.';
  }
  return null;
}

function comparePeerDurationLine(activity: ActivityRow, peers: PeerRow[]): string | null {
  const peerLoads = peers.map((p) => p.duration).filter((v): v is number => isSet(v) && v > 0);
  const avgDur = avg(peerLoads);
  if (!activity.duration || !avgDur) {
    return null;
  }
  const ratio = activity.duration / avgDur;
  if (ratio >= 1.15) {
    return '- Durée nettement plus longue que la moyenne habituelle.';
  }
  if (ratio <= 0.85) {
    return '- Durée plus courte que la moyenne habituelle.';
  }
  return null;
}

function buildComparativeFacts(activity: ActivityRow, peers: PeerRow[]): string {
  if (!peers.length) {
    return 'Comparatif 30 jours : pas assez de séances précédentes du même sport pour comparer.';
  }

  const lines = [
    `Comparatif sur ${peers.length} séance(s) du même sport dans les 30 jours précédant celle-ci :`,
    comparePeerPaceLine(activity, peers),
    comparePeerHrLine(activity, peers),
    comparePeerHrPeakLine(activity, peers),
    comparePeerDurationLine(activity, peers),
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

function mapPhysicalNotes(
  notes: Awaited<ReturnType<typeof getActivePhysicalNotes>>,
): NarrativePhysicalNote[] {
  return notes.map((note) => ({
    id: note.id,
    category: note.category,
    title: note.title,
    bodyPart: note.bodyPart,
    side: note.side,
    severity: note.severity,
    status: note.status,
    description: note.description,
    affectsTraining: note.affectsTraining,
    checkins: note.checkins.map((c) => ({ severity: c.severity, date: c.date })),
  }));
}

function isEnduranceNarrativeActivity(type: ActivityType): boolean {
  return type === ActivityType.RUN || type === ActivityType.BIKE || type === ActivityType.SWIM;
}

export async function buildActivityNarrativeFacts(
  athleteId: string,
  activityId: string,
): Promise<string | null> {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, athleteId },
    select: {
      id: true,
      type: true,
      date: true,
      title: true,
      duration: true,
      rpe: true,
      feeling: true,
      weather: true,
      notes: true,
      load: true,
      observedLocationLat: true,
      observedLocationLng: true,
      observedLocationLabel: true,
      runMetrics: {
        select: {
          distanceM: true,
          paceSecPerKm: true,
          avgHr: true,
          elevationM: true,
          avgPower: true,
          cadence: true,
        },
      },
      bikeMetrics: {
        select: {
          avgPower: true,
          normalizedPower: true,
          intensityFactor: true,
          elevationM: true,
          avgCadence: true,
        },
      },
      swimMetrics: {
        select: { distanceM: true, avgPaceSecPer100m: true, swolf: true },
      },
    },
  });

  if (!activity) {
    return null;
  }
  if (!isEnduranceNarrativeActivity(activity.type)) {
    return null;
  }

  const activityDay = startOfDay(activity.date);
  const since30 = subDays(activityDay, 30);

  const [
    peers,
    healthRows,
    profile,
    physicalNotes,
    goalHits,
    environmentPresentation,
    streamResult,
    pmcAnchor,
    dailyStress,
  ] = await Promise.all([
    prisma.activity.findMany({
      where: {
        athleteId,
        ...visibleActivityWhere,
        type: activity.type,
        date: { gte: since30, lt: activity.date },
        id: { not: activity.id },
      },
      select: {
        id: true,
        date: true,
        duration: true,
        rpe: true,
        feeling: true,
        runMetrics: {
          select: {
            distanceM: true,
            paceSecPerKm: true,
            avgHr: true,
            elevationM: true,
            cadence: true,
          },
        },
        bikeMetrics: { select: { avgPower: true, elevationM: true, avgCadence: true } },
        swimMetrics: { select: { distanceM: true, avgPaceSecPer100m: true, swolf: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    prisma.dailyHealth.findMany({
      where: { athleteId, date: { gte: subDays(activityDay, 14), lt: activityDay } },
      orderBy: { date: 'desc' },
    }),
    getAthleteProfile(athleteId),
    getActivePhysicalNotes(athleteId),
    prisma.goalAchievement.findMany({
      where: { activityId: activity.id },
      include: {
        goal: { select: { title: true, unit: true, metricKey: true, targetValue: true } },
      },
    }),
    resolveActivityEnvironmentPresentation({
      athleteId,
      activity: {
        id: activity.id,
        type: activity.type,
        date: activity.date,
        duration: activity.duration,
        weather: activity.weather,
        title: activity.title,
        notes: activity.notes,
        observedLocationLat: activity.observedLocationLat,
        observedLocationLng: activity.observedLocationLng,
        observedLocationLabel: activity.observedLocationLabel,
      },
    }).catch(() => null),
    // Cached streams only — never block narrative on Garmin/Strava stream fetch.
    getCachedActivityStreams(athleteId, activityId).catch((err) => {
      console.error('[activity-narrative-facts] streams', activityId, err);
      return null;
    }),
    // Same source as every other surface, so the narrative cannot cite a different
    // CTL than the dashboard. See ADR-011.
    loadAthletePmcAnchor(athleteId, { refDate: activity.date }),
    loadDailyTrainingStressEntries(athleteId, { refDate: activity.date }),
  ]);

  const streamPayload = streamResult;
  const streamAvgHr = streamPayload?.stats?.avgHr ?? null;

  const healthContext: NarrativeHealthRow[] = healthRows.map((row) => ({
    date: row.date,
    sleepMinutes: row.sleepMinutes,
    hrv: row.hrv,
    restingHr: row.restingHr,
    recoveryScore: row.recoveryScore,
    readinessLevel: row.readinessLevel,
    hrvStatus: row.hrvStatus,
    bodyBattery: row.bodyBattery,
  }));

  const athleteProfile: NarrativeAthleteProfile | null = profile
    ? {
        ftpW: profile.ftpW,
        lthr: profile.lthr,
        maxHr: profile.maxHr,
        runThresholdPaceSecPerKm: profile.runThresholdPaceSecPerKm,
      }
    : null;

  const metrics: NarrativeActivityMetrics = {
    type: activity.type,
    duration: activity.duration,
    load: activity.load,
    runMetrics: activity.runMetrics,
    bikeMetrics: activity.bikeMetrics,
    weather: activity.weather,
  };

  return assembleActivityNarrativeSections({
    activity: activity as ActivityRow,
    streamAvgHr,
    peers: peers as PeerRow[],
    healthContext,
    dailyStress,
    pmcAnchor,
    metrics,
    athleteProfile,
    physicalNotes,
    environmentLines: buildEnvironmentNarrativeLines(environmentPresentation),
    streamPayload,
    goalLines: buildGoalNarrativeLines(goalHits),
  });
}

function appendEnvironmentEffectLine(
  environmentPresentation: NonNullable<
    Awaited<ReturnType<typeof resolveActivityEnvironmentPresentation>>
  >,
  lines: string[],
): void {
  const effect = environmentPresentation.correction.totalAttributedEffect;
  if (effect.available && isSet(effect.value) && effect.value > 0) {
    lines.push(
      `Effet environnemental total attribué : ~${Math.round(effect.value * 100)} % sur la performance perçue.`,
    );
  }
}

function buildEnvironmentNarrativeLines(
  environmentPresentation: Awaited<
    ReturnType<typeof resolveActivityEnvironmentPresentation>
  > | null,
): string[] {
  if (!environmentPresentation?.visible) {
    return [];
  }
  const lines: string[] = [];
  for (const item of environmentPresentation.correction.narrative) {
    lines.push(
      resolveEnvironmentalExplanation(item.code, item.params ? { ...item.params } : undefined),
    );
  }
  for (const factor of environmentPresentation.correction.factors) {
    if (factor.explanation?.trim()) {
      lines.push(factor.explanation.trim());
    }
  }
  appendEnvironmentEffectLine(environmentPresentation, lines);
  return lines;
}

type GoalHitWithGoal = Awaited<
  ReturnType<
    typeof prisma.goalAchievement.findMany<{
      include: {
        goal: { select: { title: true; unit: true; metricKey: true; targetValue: true } };
      };
    }>
  >
>[number];

function buildGoalNarrativeLines(goalHits: GoalHitWithGoal[]): string[] {
  if (goalHits.length === 0) {
    return [];
  }
  return [
    'Objectifs validés par cette séance :',
    ...goalHits.map((g) => {
      const cfg = parseGoalMetricConfig(g.goal.metricKey);
      const val = formatGoalDisplayValue(g.value, g.goal.unit, cfg);
      return `- ${g.goal.title} (${val})`;
    }),
  ];
}

function assembleActivityNarrativeSections(input: {
  activity: ActivityRow;
  streamAvgHr: number | null;
  peers: PeerRow[];
  healthContext: NarrativeHealthRow[];
  dailyStress: Awaited<ReturnType<typeof loadDailyTrainingStressEntries>>;
  pmcAnchor: Awaited<ReturnType<typeof loadAthletePmcAnchor>>;
  metrics: NarrativeActivityMetrics;
  athleteProfile: NarrativeAthleteProfile | null;
  physicalNotes: Awaited<ReturnType<typeof getActivePhysicalNotes>>;
  environmentLines: string[];
  streamPayload: Awaited<ReturnType<typeof getCachedActivityStreams>>;
  goalLines: string[];
}): string {
  const technicalLines = buildTechnicalSessionFacts({
    sport: input.activity.type as 'RUN' | 'BIKE' | 'SWIM',
    analysis: input.streamPayload?.analysis ?? null,
  });

  const sections = [
    '# Cette séance (données brutes — ne pas toutes répéter en prose)',
    describeActivity(input.activity, { streamAvgHr: input.streamAvgHr }),
    '',
    '# Comparatif historique même sport (30 jours)',
    buildComparativeFacts(input.activity, input.peers),
    '',
    '# Récupération & sommeil (avant la séance)',
    ...buildRecoveryContextFacts(input.activity.date, input.healthContext),
    '',
    '# Charge d’entraînement (contexte au jour de la séance)',
    ...buildTrainingLoadFacts(input.activity.date, input.dailyStress),
    ...buildPmcFacts(input.pmcAnchor),
    '',
    '# Seuils personnels & interprétation de la performance',
    ...buildThresholdPerformanceFacts(input.metrics, input.athleteProfile),
    '',
    '# Conditions physiques actives',
    ...buildPhysicalConditionFacts(mapPhysicalNotes(input.physicalNotes)),
    '',
    '# Environnement',
    ...buildEnvironmentFacts(input.activity.weather, input.environmentLines),
  ];

  if (technicalLines.length) {
    sections.push(
      '',
      '# Technique (faits notables uniquement — silence préférable au conseil de forme permanent)',
      'Ne commente un fait technique QUE s’il change l’interprétation de la séance (charge réelle, dérive, intensité mal calibrée, irrégularité marquante). N’invente pas de cible (cadence idéale, pose du pied, « tu devrais »).',
      ...technicalLines,
    );
  }

  if (input.goalLines.length) {
    sections.push('', '# Objectifs', ...input.goalLines);
  }

  return sections.join('\n');
}
