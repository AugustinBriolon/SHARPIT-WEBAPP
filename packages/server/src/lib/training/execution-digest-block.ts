import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { prisma } from '@sharpit/db/client';
import { PrismaFeatureRepository } from '@sharpit/server/infrastructure/features/prisma-feature-repository';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import {
  buildExecutionDigest,
  EXECUTION_WINDOW_DAYS,
  HARD_SESSION_MINUTES,
  type ExecutionSession,
  type SportExecutionDigest,
} from '@sharpit/app/lib/training/execution-digest';

const DAY_MS = 86_400_000;
/** Above this drift on long sessions the aerobic base is the first thing to build (Friel). */
const HIGH_DRIFT_PERCENT = 5;

/**
 * The session features of the window, read like the load reads them: the latest version of each
 * session, and only those whose observation still exists. One outing can still come back once
 * per source; the digest folds those together.
 */
async function loadExecutionSessions(athleteId: string, now: Date): Promise<ExecutionSession[]> {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - EXECUTION_WINDOW_DAYS * DAY_MS);
  const records = await new PrismaFeatureRepository(prisma).findSessionFeaturesByRange(
    athleteId,
    day(since),
    day(now),
  );
  return records.map(({ data }) => ({
    sport: data.sportType,
    day: data.trainingDayId,
    durationSec: data.durationSec,
    timeInZones: data.timeInZones,
    hrDriftPercent: data.hrDriftPercent,
  }));
}

const percent = (share: number) => `${Math.round(share * 100)} %`;
const decimal = (value: number) => String(value).replace('.', ',');

function zoneLine(digest: SportExecutionDigest): string {
  if (!digest.zones) {
    return 'Aucune séance avec temps en zone mesuré.';
  }
  const { easy, middle, hard, measuredSessions } = digest.zones;
  return `Temps mesuré : ${percent(easy)} facile, ${percent(middle)} tempo, ${percent(hard)} au seuil et au-dessus (${measuredSessions} séances mesurées).`;
}

function hardLine(digest: SportExecutionDigest): string {
  if (digest.hardSessions === 0) {
    return `Aucune séance avec ${HARD_SESSION_MINUTES} min ou plus au seuil et au-dessus.`;
  }
  const last = format(new Date(`${digest.lastHardDay}T00:00:00`), 'd MMMM', { locale: fr });
  return `${digest.hardSessions} séance(s) avec ${HARD_SESSION_MINUTES} min ou plus au seuil et au-dessus, la dernière le ${last}.`;
}

function driftLine(digest: SportExecutionDigest): string[] {
  if (!digest.longSessionDrift) {
    return [];
  }
  const { medianPercent, sessions } = digest.longSessionDrift;
  return [
    `Dérive cardiaque médiane sur les sorties d'une heure et plus : ${decimal(medianPercent)} % (${sessions} sorties)${medianPercent > HIGH_DRIFT_PERCENT ? ' — élevée' : ''}.`,
  ];
}

function sportLines(digest: SportExecutionDigest): string {
  const label = activityTypeLabels[digest.sport as keyof typeof activityTypeLabels] ?? digest.sport;
  const head = `- ${label} : ${digest.sessions} séances, ${decimal(digest.hours)} h.`;
  return [
    head,
    zoneLine(digest),
    // Without zone times nothing says whether a session was hard.
    ...(digest.zones ? [hardLine(digest)] : []),
    ...driftLine(digest),
  ].join(' ');
}

/** The plan prompt's reading of what was actually done; empty when nothing was measured. */
export function formatExecutionDigestBlock(digests: readonly SportExecutionDigest[]): string {
  if (digests.length === 0) {
    return '';
  }
  return `\n\n## Ce que les ${EXECUTION_WINDOW_DAYS / 7} dernières semaines ont mesuré
Lu sur les enregistrements, pas sur les intitulés des séances. Les zones vélo sont lues sur la fréquence cardiaque de seuil du profil, mesurée en course à pied : elles sous-estiment l'intensité à vélo.
${digests.map(sportLines).join('\n')}
Sers-t'en ainsi :
- Un sport sans aucune séance au seuil et au-dessus sur la période, alors que la phase et l'état de l'athlète le permettent : écris-en une cette semaine, courte, et dis-le dans sa justification.
- Par rapport à la dernière séance du même type, ne change qu'une variable : la durée, puis le nombre de répétitions, puis l'intensité.
- Dérive cardiaque élevée sur les sorties longues : le volume en endurance passe avant l'intensité dans ce sport.`;
}

/** Empty on any failure: a week must still be written when the digest cannot be read. */
export async function loadExecutionDigestBlock(athleteId: string, now: Date): Promise<string> {
  try {
    const sessions = await loadExecutionSessions(athleteId, now);
    return formatExecutionDigestBlock(buildExecutionDigest(sessions, now));
  } catch (error) {
    console.error('[execution-digest]', error);
    return '';
  }
}
