/**
 * Pure FR markdown formatters for SharpIt day-score insight tools (ADR-079).
 * Callers: coach-tools-query.ts (explainDayScores / compareSleepVsReadiness / explainTargetBand).
 * No medical diagnosis — training decision framing only.
 */

import type { V1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';
import { isSet } from '@sharpit/shared/value';

export type SleepVsReadinessPoint = {
  trainingDayId: string;
  sleepMinutes: number | null;
  readiness: number | null;
};

function stressCaption(value: number): string {
  if (value >= 75) {
    return 'élevé';
  }
  if (value >= 50) {
    return 'modéré';
  }
  return 'calme';
}

function bandStatusFr(status: 'below' | 'within' | 'above' | null): string {
  if (status === 'below') {
    return 'sous la cible';
  }
  if (status === 'within') {
    return 'dans la cible';
  }
  if (status === 'above') {
    return 'au-dessus de la cible';
  }
  return 'statut inconnu';
}

/** Compact explanation of Energy Bank / stress / target for one day. */
export function formatExplainDayScoresMarkdown(input: {
  trainingDayId: string;
  scores: V1DayScores;
  readiness?: number | null;
}): string {
  const lines: string[] = [`## Scores du ${input.trainingDayId}`, ''];

  if (isSet(input.scores.energyBank?.value)) {
    const typical = isSet(input.scores.energyBank.typicalBaseline)
      ? ` (typique ~${Math.round(input.scores.energyBank.typicalBaseline)})`
      : '';
    lines.push(
      `- **Réserve d'énergie** : ${Math.round(input.scores.energyBank.value)}/100${typical} — batterie SharpIt du jour (récupération, sommeil, charge, stress).`,
    );
  } else {
    lines.push("- **Réserve d'énergie** : indisponible (données insuffisantes).");
  }

  if (input.scores.stress) {
    lines.push(
      `- **Stress** : ${Math.round(input.scores.stress.value)}/100 (${stressCaption(input.scores.stress.value)}).`,
    );
  } else {
    lines.push('- **Stress** : indisponible.');
  }

  if (input.scores.targetBand) {
    const { low, high, status } = input.scores.targetBand;
    lines.push(
      `- **Cible d'effort** : ${Math.round(low)}–${Math.round(high)} (${bandStatusFr(status)}).`,
    );
  } else {
    lines.push("- **Cible d'effort** : indisponible.");
  }

  if (isSet(input.readiness)) {
    lines.push(`- **Forme** : ${Math.round(input.readiness)}/100.`);
  }

  lines.push(
    '',
    '_Cadre entraînement SharpIt — pas un diagnostic médical. Ne pas extrapoler à une pathologie._',
  );
  return lines.join('\n');
}

export function formatExplainTargetBandMarkdown(input: {
  trainingDayId: string;
  band: NonNullable<V1DayScores['targetBand']>;
  readiness?: number | null;
}): string {
  const { low, high, status } = input.band;
  const lines = [
    `## Cible d'effort · ${input.trainingDayId}`,
    '',
    `Fenêtre du jour : **${Math.round(low)}–${Math.round(high)}** (${bandStatusFr(status)}).`,
    isSet(input.readiness)
      ? `Forme du jour : ${Math.round(input.readiness)}/100 — la bande se resserre quand la forme est basse, s'ouvre quand elle est haute.`
      : 'Forme du jour indisponible — la bande s’appuie sur l’historique de charge récent.',
    '',
    'Interprétation coach : rester dans la bande protège la progression ; en dessous = jour trop léger pour le stimulus, au-dessus = risque de surcharge à court terme.',
    '',
    '_Cadre entraînement SharpIt — pas un diagnostic médical._',
  ];
  return lines.join('\n');
}

export function formatCompareSleepVsReadinessMarkdown(
  points: SleepVsReadinessPoint[],
  windowDays: 7 | 14,
): string {
  const usable = points.filter((p) => isSet(p.sleepMinutes) || isSet(p.readiness));
  if (usable.length === 0) {
    return `## Sommeil vs forme (${windowDays} j)\n\nPas assez de nuits / scores de forme sur cette fenêtre.`;
  }

  const lines = [
    `## Sommeil vs forme (${windowDays} j)`,
    '',
    '| Jour | Sommeil | Forme |',
    '| --- | --- | --- |',
  ];
  for (const point of usable) {
    const sleep = isSet(point.sleepMinutes)
      ? `${Math.floor(point.sleepMinutes / 60)} h ${point.sleepMinutes % 60}`
      : '—';
    const ready = isSet(point.readiness) ? `${Math.round(point.readiness)}` : '—';
    lines.push(`| ${point.trainingDayId} | ${sleep} | ${ready} |`);
  }

  const paired = usable.filter((p) => isSet(p.sleepMinutes) && isSet(p.readiness));
  if (paired.length >= 3) {
    const shortSleepLowReady = paired.filter(
      (p) => (p.sleepMinutes as number) < 390 && (p.readiness as number) < 55,
    ).length;
    lines.push(
      '',
      shortSleepLowReady > 0
        ? `Observation : ${shortSleepLowReady} nuit(s) courte(s) (<6 h 30) associées à une forme basse — prioriser la récupération avant de monter la charge.`
        : 'Observation : pas de schéma fort « nuit courte → forme basse » sur cette fenêtre ; croiser avec le stress et la charge.',
    );
  }

  lines.push('', '_Cadre entraînement SharpIt — pas un diagnostic médical._');
  return lines.join('\n');
}
