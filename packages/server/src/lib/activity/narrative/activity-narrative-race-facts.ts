import type { RaceAnalysis, RaceAnalysisLeg } from '@sharpit/app/lib/activity/race-analysis-types';
import { formatDistance, formatDuration } from '@sharpit/app/lib/format';

const PACING_UNIT_LABEL = {
  sec_per_100m: 's/100 m',
  kmh: 'km/h',
  sec_per_km: 's/km',
} as const;

function signedDuration(deltaSec: number): string {
  return `${deltaSec <= 0 ? '−' : '+'}${formatDuration(Math.abs(deltaSec))}`;
}

function totalLine(analysis: RaceAnalysis): string {
  const total = `Temps final : ${formatDuration(analysis.total.seconds)}`;
  if (analysis.target.seconds === null || analysis.total.deltaSec === null) {
    return analysis.target.label
      ? `${total} (objectif « ${analysis.target.label} », non chiffré)`
      : total;
  }
  const side = analysis.total.deltaSec <= 0 ? 'sous' : 'au-dessus de';
  return `${total} · objectif ${formatDuration(analysis.target.seconds)} → ${signedDuration(analysis.total.deltaSec)} (${side} la cible)`;
}

function zonesBit(leg: RaceAnalysisLeg): string | null {
  if (!leg.hrZonesSec) {
    return null;
  }
  const total = leg.hrZonesSec.reduce((sum, seconds) => sum + seconds, 0);
  if (total <= 0) {
    return null;
  }
  return `zones FC ${leg.hrZonesSec.map((s, i) => `Z${i + 1} ${Math.round((s / total) * 100)} %`).join(', ')}`;
}

function pacingBit(leg: RaceAnalysisLeg): string | null {
  if (!leg.pacing) {
    return null;
  }
  const { unit, firstHalf, secondHalf, changePct } = leg.pacing;
  const trend = changePct > 0 ? 'ralentissement' : 'accélération';
  return `1re moitié ${firstHalf} → 2e moitié ${secondHalf} ${PACING_UNIT_LABEL[unit]} (${trend} ${Math.abs(changePct)} %)`;
}

function legLine(leg: RaceAnalysisLeg): string {
  return [
    `- ${leg.label} : ${formatDuration(leg.durationSec)}`,
    leg.distanceM ? formatDistance(leg.distanceM) : null,
    leg.avgHr ? `FC moy ${leg.avgHr}` : null,
    zonesBit(leg),
    pacingBit(leg),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Pure: the race section of the narrative facts — goal, total vs target, legs, effort, load. */
export function buildRaceNarrativeLines(
  analysis: RaceAnalysis,
  goalTitle: string | null,
): string[] {
  return [
    goalTitle ? `Course visée : ${goalTitle}` : 'Course (sans objectif rattaché)',
    totalLine(analysis),
    'Étapes :',
    ...analysis.legs.map(legLine),
    analysis.runHrDriftPct === null
      ? null
      : `Dérive cardiaque sur la course à pied (découplage allure:FC) : ${analysis.runHrDriftPct} %`,
    analysis.load.tss === null
      ? null
      : `Charge de la course : ${Math.round(analysis.load.tss)} TSS`,
  ].filter((line): line is string => line !== null);
}
