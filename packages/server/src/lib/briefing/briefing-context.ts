import { athleteText } from '@sharpit/server/lib/ai/athlete-text';
import { differenceInCalendarDays, format, isSameDay, startOfDay, subDays } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import { fr } from 'date-fns/locale';
import {
  BRIEFING_PHASE_LABELS,
  DAILY_PHASE_BRIEFING_LABELS,
  resolveBriefingPhase,
  resolveBriefingPhaseFromDailyPhase,
  type BriefingPhase,
} from '@sharpit/server/lib/briefing/briefing-phase';
import type { DailyPhase } from '@sharpit/app/lib/daily-phase/types';
import { getActivities, getPlannedSessions } from '@sharpit/server/lib/queries';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';

const TYPE_FR: Record<string, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
  STRENGTH: 'Renfo',
};

type ActivityWithMetrics = Awaited<ReturnType<typeof getActivities>>[number];

function formatMin(seconds?: number | null): string {
  if (!seconds) {
    return '—';
  }
  return `${Math.round(seconds / 60)} min`;
}

function formatPace(secPerKm?: number | null): string | null {
  if (secPerKm === undefined || secPerKm === null || secPerKm <= 0) {
    return null;
  }
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

function relativeDayLabel(activityDate: Date, refDate: Date): string {
  const diff = differenceInCalendarDays(startOfDay(refDate), startOfDay(activityDate));
  if (diff === 0) {
    return "aujourd'hui";
  }
  if (diff === 1) {
    return 'hier';
  }
  return format(activityDate, 'EEE d MMM', { locale: fr });
}

function formatRunMetricParts(runMetrics: ActivityWithMetrics['runMetrics']): string[] {
  if (!runMetrics) {
    return [];
  }
  const parts: string[] = [];
  if (runMetrics.distanceM) {
    parts.push(`${(runMetrics.distanceM / 1000).toFixed(1)} km`);
  }
  const pace = formatPace(runMetrics.paceSecPerKm);
  if (pace) {
    parts.push(pace);
  }
  if (runMetrics.avgHr) {
    parts.push(`${runMetrics.avgHr} bpm`);
  }
  return parts;
}

function formatBikeMetricParts(bikeMetrics: ActivityWithMetrics['bikeMetrics']): string[] {
  if (!bikeMetrics) {
    return [];
  }
  const parts: string[] = [];
  if (bikeMetrics.avgPower) {
    parts.push(`${Math.round(bikeMetrics.avgPower)} W`);
  }
  if (bikeMetrics.tss) {
    parts.push(`TSS ${Math.round(bikeMetrics.tss)}`);
  }
  return parts;
}

function formatActivityExtra(a: ActivityWithMetrics, parts: string[], refDate: Date): string {
  const time = format(new Date(a.date), 'HH:mm');
  const rel = relativeDayLabel(new Date(a.date), refDate);
  return [
    `à ${time}`,
    `(${rel})`,
    isSet(a.load) ? `charge ${Math.round(a.load)}` : null,
    isSet(a.rpe) ? `RPE ${a.rpe}` : null,
    a.feeling ? `ressenti ${a.feeling}` : null,
    parts.length ? parts.join(' · ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatActivityLine(a: ActivityWithMetrics, refDate: Date): string {
  const parts = [
    ...formatRunMetricParts(a.runMetrics),
    ...formatBikeMetricParts(a.bikeMetrics),
    ...(a.swimMetrics?.distanceM ? [`${a.swimMetrics.distanceM} m`] : []),
  ];
  const extra = formatActivityExtra(a, parts, refDate);
  const titleSuffix = a.title ? ` · ${athleteText(a.title)}` : '';
  return `- ${TYPE_FR[a.type] ?? a.type}${titleSuffix} (${formatMin(a.duration)}) — ${extra}`;
}

export type BriefingDayContext = {
  phase: BriefingPhase;
  dailyPhase: DailyPhase | null;
  phaseLabel: string;
  todayLabel: string;
  sessionsDoneToday: string[];
  sessionsYesterday: string[];
  sessionsStillPlannedToday: string[];
  hasSessionsDoneToday: boolean;
};

/** Contexte structuré pour le briefing — sépare strictement aujourd'hui / hier / prévu. */
export async function buildBriefingDayContext(
  athleteId: string,
  refDate: Date = new Date(),
  dailyPhase: DailyPhase | null = null,
): Promise<BriefingDayContext> {
  const today = startOfDay(refDate);
  const yesterday = subDays(today, 1);

  const [activities, plannedToday] = await Promise.all([
    getActivities(athleteId, { limit: 40 }),
    getPlannedSessions(athleteId, { from: today, to: today }),
  ]);

  const doneToday = activities
    .filter((a) => isSameDay(new Date(a.date), today))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const doneYesterday = activities
    .filter((a) => isSameDay(new Date(a.date), yesterday))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const stillPlanned = plannedToday.filter((p) => !p.completed && !p.activityId);

  const phase = dailyPhase
    ? resolveBriefingPhaseFromDailyPhase(dailyPhase)
    : resolveBriefingPhase(refDate);

  return {
    phase,
    dailyPhase,
    phaseLabel: dailyPhase ? DAILY_PHASE_BRIEFING_LABELS[dailyPhase] : BRIEFING_PHASE_LABELS[phase],
    todayLabel: format(today, 'EEEE d MMMM yyyy', { locale: fr }),
    sessionsDoneToday: doneToday.map((a) => formatActivityLine(a, refDate)),
    sessionsYesterday: doneYesterday.map((a) => formatActivityLine(a, refDate)),
    sessionsStillPlannedToday: stillPlanned.length
      ? stillPlanned.map((p) => {
          const bits = [
            TYPE_FR[p.type] ?? p.type,
            p.title ? athleteText(p.title) : null,
            p.startTime ? `à ${p.startTime}` : null,
            p.intensity ? intensityLabels[p.intensity] : null,
            p.durationMin ? `${p.durationMin} min` : null,
          ].filter(Boolean);
          const line = `- ${bits.join(' · ')}`;
          return p.description ? `${line}\n  Consigne : ${athleteText(p.description)}` : line;
        })
      : [],
    hasSessionsDoneToday: doneToday.length > 0,
  };
}

export function formatBriefingDayContext(dayCtx: BriefingDayContext): string {
  const lines: string[] = [];
  lines.push(`Phase du jour : ${dayCtx.phaseLabel} (${dayCtx.todayLabel})`);

  lines.push("\n## Séances RÉALISÉES aujourd'hui (à mentionner comme fait aujourd'hui)");
  lines.push(
    dayCtx.sessionsDoneToday.length
      ? dayCtx.sessionsDoneToday.join('\n')
      : "Aucune séance réalisée aujourd'hui pour l'instant.",
  );

  lines.push("\n## Séances d'HIER (contexte uniquement — NE PAS les attribuer à aujourd'hui)");
  lines.push(
    dayCtx.sessionsYesterday.length ? dayCtx.sessionsYesterday.join('\n') : 'Aucune séance hier.',
  );

  lines.push("\n## Séances encore PRÉVUES aujourd'hui (pas encore réalisées)");
  lines.push(
    dayCtx.sessionsStillPlannedToday.length
      ? dayCtx.sessionsStillPlannedToday.join('\n')
      : 'Rien de planifié pour le reste de la journée.',
  );

  return lines.join('\n');
}

export async function briefingNeedsRegeneration(params: {
  trainingDayId: string;
  briefingGeneratedAt: Date | null;
  reasoningComputedAt: Date | null;
  latestSessionAt: Date | null;
}): Promise<boolean> {
  const { briefingGeneratedAt, reasoningComputedAt, latestSessionAt } = params;
  if (!briefingGeneratedAt) {
    return true;
  }
  if (reasoningComputedAt && briefingGeneratedAt < reasoningComputedAt) {
    return true;
  }
  if (latestSessionAt && latestSessionAt > briefingGeneratedAt) {
    return true;
  }
  return false;
}
