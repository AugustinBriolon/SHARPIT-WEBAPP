import { athleteText } from '@sharpit/server/lib/ai/athlete-text';
import type { ActivityType } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { pmcTsb, type PmcState } from '@sharpit/app/lib/training/pmc/pmc';
import {
  formatActivityWeatherNarrative,
  parseActivityWeather,
} from '@sharpit/app/lib/activity/weather/activity-weather';
import {
  categoryLabels,
  sideLabels,
  statusLabels,
} from '@sharpit/app/lib/physical-health/physical';
import { computeTrainingLoad } from '@sharpit/server/lib/training/load/training-load';

const SLEEP_TARGET_MIN = 390; // 6h30 — seuil récupération (cf. alerts.ts)

export type NarrativeHealthRow = {
  date: Date;
  sleepMinutes: number | null;
  hrv: number | null;
  restingHr: number | null;
  recoveryScore: number | null;
  readinessLevel: string | null;
  hrvStatus: string | null;
  bodyBattery: number | null;
};

export type NarrativePhysicalNote = {
  id: string;
  category: keyof typeof categoryLabels;
  title: string;
  bodyPart: string | null;
  side: keyof typeof sideLabels;
  severity: number | null;
  status: keyof typeof statusLabels;
  description: string | null;
  affectsTraining: boolean;
  checkins: { severity: number | null; date: Date }[];
};

export type NarrativeAthleteProfile = {
  ftpW: number | null;
  lthr: number | null;
  maxHr: number | null;
  runThresholdPaceSecPerKm: number | null;
};

export type NarrativeActivityMetrics = {
  type: ActivityType;
  duration: number | null;
  load: number | null;
  runMetrics: {
    paceSecPerKm: number | null;
    avgHr: number | null;
    avgPower: number | null;
  } | null;
  bikeMetrics: {
    avgPower: number | null;
    normalizedPower: number | null;
    intensityFactor: number | null;
  } | null;
  weather: string | null;
};

function avg(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fmtPace(secPerKm?: number | null): string | null {
  if (secPerKm === undefined || secPerKm === null || secPerKm <= 0) {
    return null;
  }
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}/km`;
}

function fmtSleep(minutes: number | null): string | null {
  if (minutes === undefined || minutes === null) {
    return null;
  }
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function pctDelta(actual: number, reference: number): number {
  return Math.round(((actual - reference) / reference) * 100);
}

function formatDayBeforeRecoveryLine(
  activityDay: Date,
  beforeActivity: NarrativeHealthRow[],
): string | null {
  const dayBefore = beforeActivity.find(
    (row) => differenceInCalendarDays(activityDay, startOfDay(row.date)) === 1,
  );
  if (!dayBefore) {
    return 'Pas de données santé la veille de la séance.';
  }
  const bits = [
    isSet(dayBefore.sleepMinutes) ? `sommeil ${fmtSleep(dayBefore.sleepMinutes)}` : null,
    isSet(dayBefore.hrv) ? `HRV ${Math.round(dayBefore.hrv)} ms` : null,
    isSet(dayBefore.restingHr) ? `FC repos ${Math.round(dayBefore.restingHr)} bpm` : null,
    isSet(dayBefore.recoveryScore) ? `readiness ${Math.round(dayBefore.recoveryScore)}/100` : null,
    isSet(dayBefore.bodyBattery) ? `body battery ${Math.round(dayBefore.bodyBattery)}` : null,
  ].filter(Boolean);
  if (!bits.length) {
    return null;
  }
  return `Veille de séance (${format(dayBefore.date, 'EEE d MMM', { locale: fr })}) : ${bits.join(', ')}.`;
}

function formatSevenDayTrendLine(beforeActivity: NarrativeHealthRow[]): string | null {
  const last7 = beforeActivity.slice(0, 7);
  const avgSleep = avg(last7.map((row) => row.sleepMinutes).filter((v): v is number => isSet(v)));
  const avgHrv = avg(last7.map((row) => row.hrv).filter((v): v is number => isSet(v)));
  const avgReadiness = avg(
    last7.map((row) => row.recoveryScore).filter((v): v is number => isSet(v)),
  );
  const avgRhr = avg(last7.map((row) => row.restingHr).filter((v): v is number => isSet(v)));
  const trendBits = [
    isSet(avgSleep) ? `sommeil moy. 7j ${fmtSleep(Math.round(avgSleep))}` : null,
    isSet(avgHrv) ? `HRV moy. 7j ${Math.round(avgHrv)} ms` : null,
    isSet(avgReadiness) ? `readiness moy. 7j ${Math.round(avgReadiness)}/100` : null,
    isSet(avgRhr) ? `FC repos moy. 7j ${Math.round(avgRhr)} bpm` : null,
  ].filter(Boolean);
  return trendBits.length ? `Tendance 7 jours avant séance : ${trendBits.join(', ')}.` : null;
}

function formatSleepDebtLine(avgSleep: number | null): string | null {
  if (avgSleep === undefined || avgSleep === null) {
    return null;
  }
  const debtMin = SLEEP_TARGET_MIN - avgSleep;
  if (debtMin > 15) {
    return `Dette de sommeil probable : moyenne ${fmtSleep(Math.round(avgSleep))}/nuit sur 7j, soit ~${Math.round(debtMin)} min/nuit sous la cible récupération (${fmtSleep(SLEEP_TARGET_MIN)}).`;
  }
  if (debtMin < -15) {
    return `Sommeil récent au-dessus de la cible récupération (${fmtSleep(SLEEP_TARGET_MIN)}/nuit en moyenne sur 7j).`;
  }
  return null;
}

function formatReadinessDeltaLine(recent: number | null, prior: number | null): string | null {
  if (recent === undefined || recent === null || prior === undefined || prior === null) {
    return null;
  }
  const diff = Math.round(recent - prior);
  if (Math.abs(diff) < 5) {
    return null;
  }
  return diff < 0
    ? `Readiness en baisse récente : ${Math.round(recent)}/100 (3 derniers jours) vs ${Math.round(prior)}/100 (fenêtre précédente).`
    : `Readiness en hausse récente : ${Math.round(recent)}/100 (3 derniers jours) vs ${Math.round(prior)}/100 (fenêtre précédente).`;
}

function formatHrvDeltaLine(recent: number | null, prior: number | null): string | null {
  if (recent === undefined || recent === null || prior === undefined || prior === null) {
    return null;
  }
  const diff = Math.round(recent - prior);
  if (Math.abs(diff) < 3) {
    return null;
  }
  return diff < 0
    ? `HRV en baisse sur les 3 derniers jours (${Math.round(recent)} ms vs ${Math.round(prior)} ms avant).`
    : `HRV en hausse sur les 3 derniers jours (${Math.round(recent)} ms vs ${Math.round(prior)} ms avant).`;
}

export function buildRecoveryContextFacts(
  activityDate: Date,
  healthRows: NarrativeHealthRow[],
): string[] {
  const activityDay = startOfDay(activityDate);
  const beforeActivity = healthRows.filter((row) => startOfDay(row.date) < activityDay);
  if (!beforeActivity.length) {
    return ['Pas de données santé/sommeil sur les 14 jours précédant la séance.'];
  }

  const lines: string[] = [];
  const dayBeforeLine = formatDayBeforeRecoveryLine(activityDay, beforeActivity);
  if (dayBeforeLine) {
    lines.push(dayBeforeLine);
  }

  const trendLine = formatSevenDayTrendLine(beforeActivity);
  if (trendLine) {
    lines.push(trendLine);
  }

  const last7 = beforeActivity.slice(0, 7);
  const avgSleep = avg(last7.map((row) => row.sleepMinutes).filter((v): v is number => isSet(v)));
  const sleepDebtLine = formatSleepDebtLine(avgSleep);
  if (sleepDebtLine) {
    lines.push(sleepDebtLine);
  }

  const recent3 = beforeActivity.slice(0, 3);
  const prior7 = beforeActivity.slice(3, 10);
  const readinessRecent = avg(
    recent3.map((row) => row.recoveryScore).filter((v): v is number => isSet(v)),
  );
  const readinessPrior = avg(
    prior7.map((row) => row.recoveryScore).filter((v): v is number => isSet(v)),
  );
  const readinessLine = formatReadinessDeltaLine(readinessRecent, readinessPrior);
  if (readinessLine) {
    lines.push(readinessLine);
  }

  const hrvRecent = avg(recent3.map((row) => row.hrv).filter((v): v is number => isSet(v)));
  const hrvPrior = avg(prior7.map((row) => row.hrv).filter((v): v is number => isSet(v)));
  const hrvLine = formatHrvDeltaLine(hrvRecent, hrvPrior);
  if (hrvLine) {
    lines.push(hrvLine);
  }

  return lines;
}

export function buildTrainingLoadFacts(
  activityDate: Date,
  activities: { date: Date; load: number | null }[],
): string[] {
  const upToSession = activities.filter((a) => a.date <= activityDate);
  if (!upToSession.length) {
    return ['Pas assez d’historique pour estimer la charge d’entraînement.'];
  }

  const load = computeTrainingLoad(upToSession, activityDate);
  const lines = [
    `Charge 7 jours glissants (au jour de la séance) : ${load.weeklyLoad} TSS.`,
    `ACWR au jour de la séance : ${load.acwr} (fatigue estimée : ${load.fatigue}).`,
  ];

  if (isSet(load.loadMonotony)) {
    lines.push(`Monotonie de charge 7j : ${load.loadMonotony}.`);
  }

  const recentSessions = upToSession
    .filter((a) => a.date < activityDate && (a.load ?? 0) > 0)
    .slice(0, 5);
  if (recentSessions.length) {
    lines.push(
      'Séances chargées récentes (avant celle-ci) : ' +
        recentSessions
          .map((a) => {
            const days = differenceInCalendarDays(startOfDay(activityDate), startOfDay(a.date));
            return `J-${days} · ${Math.round(a.load ?? 0)} TSS`;
          })
          .join(' ; ') +
        '.',
    );
  }

  return lines;
}

/**
 * The caller passes the PMC state on the session day, loaded through
 * `loadAthletePmcAnchor` so this narrative cites the same numbers as every other
 * surface. See ADR-011.
 */
export function buildPmcFacts(anchor: PmcState | null): string[] {
  if (!anchor) {
    return [];
  }

  // TSB comes straight from the state: `toPmcPoints` is the chart adapter and
  // formats a date label, which a stateless anchor has no day to supply.
  const tsb = Math.round(pmcTsb(anchor));

  return [
    `Forme (PMC au jour de la séance) : CTL ${Math.round(anchor.ctl)}, ATL ${Math.round(anchor.atl)}, TSB ${tsb}.`,
    interpretTsb(tsb),
  ];
}

function interpretTsb(tsb: number): string {
  if (tsb >= 15) {
    return 'TSB positif marqué : fraîcheur relative possible (affûtage ou sous-charge récente).';
  }
  if (tsb >= 0) {
    return 'TSB légèrement positif : équilibre charge/récupération globalement favorable.';
  }
  if (tsb >= -20) {
    return 'TSB légèrement négatif : fatigue d’entraînement normale en phase de charge.';
  }
  return 'TSB très négatif : fatigue accumulée importante à croiser avec sommeil/récupération/conditions physiques.';
}

function profileThresholdSummary(profile: NarrativeAthleteProfile): string | null {
  const seuils = [
    isSet(profile.ftpW) ? `FTP ${profile.ftpW} W` : null,
    isSet(profile.lthr) ? `LTHR ${profile.lthr} bpm` : null,
    isSet(profile.maxHr) ? `FC max ${profile.maxHr} bpm` : null,
    fmtPace(profile.runThresholdPaceSecPerKm)
      ? `allure seuil ${fmtPace(profile.runThresholdPaceSecPerKm)}`
      : null,
  ].filter(Boolean);
  return seuils.length ? `Seuils personnels : ${seuils.join(', ')}.` : null;
}

function runPaceThresholdFact(paceSecPerKm: number, thresholdPace: number): string {
  const delta = pctDelta(paceSecPerKm, thresholdPace);
  if (delta > 0) {
    return `Allure séance ${fmtPace(paceSecPerKm)} : ~${delta}% plus lente que l’allure seuil personnelle.`;
  }
  if (delta < -2) {
    return `Allure séance ${fmtPace(paceSecPerKm)} : ~${Math.abs(delta)}% plus rapide que l’allure seuil personnelle.`;
  }
  return `Allure séance ${fmtPace(paceSecPerKm)} : proche de l’allure seuil personnelle.`;
}

function runThresholdFacts(
  activity: NarrativeActivityMetrics,
  profile: NarrativeAthleteProfile,
): string[] {
  if (activity.type !== 'RUN' || !activity.runMetrics) {
    return [];
  }
  const lines: string[] = [];
  const { paceSecPerKm, avgHr } = activity.runMetrics;
  if (profile.runThresholdPaceSecPerKm && paceSecPerKm) {
    lines.push(runPaceThresholdFact(paceSecPerKm, profile.runThresholdPaceSecPerKm));
  }
  if (profile.lthr && avgHr) {
    lines.push(
      `FC moyenne ${Math.round(avgHr)} bpm = ${Math.round((avgHr / profile.lthr) * 100)}% LTHR.`,
    );
  }
  return lines;
}

function bikeThresholdFacts(
  activity: NarrativeActivityMetrics,
  profile: NarrativeAthleteProfile,
): string[] {
  if (activity.type !== 'BIKE' || !activity.bikeMetrics || !profile.ftpW) {
    return [];
  }
  const { avgPower, normalizedPower, intensityFactor } = activity.bikeMetrics;
  if (normalizedPower) {
    const ifVal = intensityFactor ?? normalizedPower / profile.ftpW;
    return [
      `Puissance normalisée ${Math.round(normalizedPower)} W (IF ~${ifVal.toFixed(2)} vs FTP ${profile.ftpW} W).`,
    ];
  }
  if (avgPower) {
    return [
      `Puissance moyenne ${Math.round(avgPower)} W (~${Math.round((avgPower / profile.ftpW) * 100)}% FTP).`,
    ];
  }
  return [];
}

export function buildThresholdPerformanceFacts(
  activity: NarrativeActivityMetrics,
  profile: NarrativeAthleteProfile | null,
): string[] {
  if (!profile) {
    return ['Seuils personnels non renseignés dans le profil.'];
  }

  const summary = profileThresholdSummary(profile);
  const lines = summary ? [summary] : [];
  lines.push(...runThresholdFacts(activity, profile));
  lines.push(...bikeThresholdFacts(activity, profile));

  if (activity.runMetrics?.avgHr && profile.maxHr && !profile.lthr && activity.type !== 'BIKE') {
    lines.push(
      `FC moyenne ${Math.round(activity.runMetrics.avgHr)} bpm (~${Math.round((activity.runMetrics.avgHr / profile.maxHr) * 100)}% FC max).`,
    );
  }

  return lines;
}

function physicalNoteTrend(checkins: NarrativePhysicalNote['checkins']): string | null {
  if (checkins.length < 2) {
    return null;
  }
  const last = checkins[0]?.severity;
  const prev = checkins[1]?.severity;
  if (!isSet(last) || !isSet(prev)) {
    return null;
  }
  if (last < prev) {
    return 'tendance amélioration';
  }
  if (last > prev) {
    return 'tendance aggravation';
  }
  return 'tendance stable';
}

export function buildPhysicalConditionFacts(notes: NarrativePhysicalNote[]): string[] {
  const active = notes.filter((note) => note.affectsTraining && note.status !== 'RESOLVED');
  if (!active.length) {
    return ['Aucune condition physique active signalée (douleur, posture, mobilité).'];
  }

  return active.map((note) => {
    const trend = physicalNoteTrend(note.checkins);

    const bits = [
      `${categoryLabels[note.category]} · ${athleteText(note.title)}`,
      note.bodyPart
        ? `zone ${athleteText(note.bodyPart)}${note.side !== 'NA' ? ` (${sideLabels[note.side]})` : ''}`
        : null,
      isSet(note.severity) ? `sévérité ${note.severity}/10` : null,
      `statut ${statusLabels[note.status]}`,
      trend,
      note.description ? `note : ${athleteText(note.description)}` : null,
    ].filter(Boolean);
    return `- ${bits.join(' · ')}`;
  });
}

export function buildEnvironmentFacts(
  weather: string | null,
  environmentLines: string[],
): string[] {
  const lines: string[] = [];
  const parsed = parseActivityWeather(weather);
  if (parsed) {
    lines.push(`Conditions observées : ${formatActivityWeatherNarrative(parsed)}.`);
  } else if (weather?.trim()) {
    lines.push(`Conditions observées : ${weather.trim()}.`);
  }

  for (const line of environmentLines) {
    if (line.trim()) {
      lines.push(line.trim());
    }
  }

  return lines.length
    ? lines
    : ['Pas de données environnementales exploitables pour cette séance.'];
}
