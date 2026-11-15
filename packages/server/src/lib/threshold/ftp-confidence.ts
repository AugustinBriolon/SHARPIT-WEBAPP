import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { prisma } from '@sharpit/db/client';
import {
  assessFtpConfidence,
  meanOverBestWindow,
  type FtpConfidence,
  type FtpEvidence,
} from '@sharpit/app/lib/threshold/threshold-confidence';
import { filterRecordsForThresholdWindow } from '@sharpit/app/lib/threshold/threshold-estimates';
import { estimateFtp } from '@sharpit/app/lib/training/periodization/performance-predictor';
import { getAthleteProfile } from '@sharpit/server/lib/queries';
import { getStoredRecords, resample1Hz } from '@sharpit/server/lib/training/records/records';

type EffortStreams = { time?: number[]; watts?: number[]; heartrate?: number[] };

/** Mean heart rate over the recording's best `seconds` of power; null without both signals. */
async function loadEffortHeartRate(activityId: string, seconds: number): Promise<number | null> {
  const stream = await prisma.activityStream.findFirst({
    where: { activityId, available: true },
    select: { data: true },
  });
  const raw = stream?.data as EffortStreams | null | undefined;
  if (!raw?.time?.length || !raw.watts?.length || !raw.heartrate?.length) {
    return null;
  }
  const watts = resample1Hz(raw.time, raw.watts);
  // A whole-ride effort is as long as the recording, give or take a pause.
  const window = Math.min(seconds, watts.length);
  return meanOverBestWindow(watts, resample1Hz(raw.time, raw.heartrate), window);
}

export async function getFtpConfidence(athleteId: string, now: Date): Promise<FtpConfidence> {
  const [records, profile] = await Promise.all([
    getStoredRecords(athleteId),
    getAthleteProfile(athleteId),
  ]);
  const { powerCurve, bikeEfforts } = filterRecordsForThresholdWindow(records, undefined, now);
  const effort = estimateFtp(powerCurve, bikeEfforts)?.effort;
  if (!effort?.date) {
    return { level: 'none' };
  }
  const evidence: FtpEvidence = {
    watts: effort.watts,
    seconds: effort.seconds,
    date: effort.date,
    avgHr: effort.activityId ? await loadEffortHeartRate(effort.activityId, effort.seconds) : null,
  };
  return assessFtpConfidence(evidence, profile?.maxHr ?? null);
}

function describeEffort(evidence: FtpEvidence): string {
  const day = format(new Date(evidence.date), 'd MMMM', { locale: fr });
  const heartRate = evidence.avgHr !== null ? ` à ${evidence.avgHr} bpm de moyenne` : '';
  return `${evidence.watts} W sur ${Math.round(evidence.seconds / 60)} min le ${day}${heartRate}`;
}

/** The plan prompt's reading of the bike threshold: what it rests on, and what to do about it. */
export function formatFtpConfidenceBlock(confidence: FtpConfidence): string {
  if (confidence.level === 'none') {
    return '';
  }
  const effort = describeEffort(confidence.evidence);
  if (confidence.level === 'verified') {
    const bikeLthr = confidence.bikeLthr
      ? ` FC seuil vélo observée ≈ ${confidence.bikeLthr} bpm : pour les cibles cardiaques à vélo, utilise-la à la place de la LTHR, mesurée en course à pied.`
      : '';
    return `\n\n## Fiabilité de la FTP\nFTP appuyée par un effort proche du maximum (${effort}).${bikeLthr}`;
  }
  return `\n\n## Fiabilité de la FTP
FTP non vérifiée : ${
    confidence.evidence.avgHr !== null
      ? `le meilleur effort récent (${effort}) n'était pas un effort maximal`
      : `rien ne montre que le meilleur effort récent (${effort}) était maximal, sa fréquence cardiaque n'est pas enregistrée`
  }. La FTP du profil est donc un plancher, la vraie valeur est probablement plus haute.
Si la semaine s'y prête (aucune course dans les 10 jours, fraîcheur correcte, aucune douleur active), remplace UNE séance de qualité vélo par un test (20 min à fond après un échauffement complet, ou test en rampe) et dis-le dans sa justification. Un seul test, jamais deux semaines de suite.
Sinon, pour toute cible vélo au seuil ou au-dessus, décris aussi l'effort perçu attendu : les watts seuls sous-estimeraient l'effort.`;
}

/** Empty on any failure: a week must still be written when the evidence cannot be read. */
export async function loadFtpConfidenceBlock(athleteId: string, now: Date): Promise<string> {
  try {
    return formatFtpConfidenceBlock(await getFtpConfidence(athleteId, now));
  } catch (error) {
    console.error('[ftp-confidence]', error);
    return '';
  }
}
