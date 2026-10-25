import { prisma } from '@sharpit/db/client';
import { readSelfEvaluation } from '@sharpit/server/lib/integrations/garmin/garmin-fit-evaluation';
import { getValidGarminAccessToken } from '@sharpit/server/lib/integrations/garmin/garmin-sync';

type Json = Record<string, unknown>;

/** The one host the athlete's bearer token is ever sent to. */
const GARMIN_FILE_HOST = 'apis.garmin.com';
const DOWNLOAD_TIMEOUT_MS = 20_000;

async function downloadFit(callbackUrl: string, accessToken: string): Promise<Uint8Array> {
  const url = new URL(callbackUrl);
  if (url.protocol !== 'https:' || url.hostname !== GARMIN_FILE_HOST) {
    throw new Error('Garmin file URL refused');
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Garmin file download ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Activity Files: the FIT of a session carries what the summaries leave out — the effort and
 * the feel the athlete answered on the watch. They fill the activity's RPE and feeling only
 * where it has none, so what the athlete wrote in SharpIt always stands. A file that arrives
 * before its activity throws, and the inbox replays the row.
 */
export async function processActivityFiles(athleteId: string, items: Json[]): Promise<void> {
  let accessToken: string | null = null;
  for (const item of items) {
    if (
      item.fileType !== 'FIT' ||
      typeof item.callbackURL !== 'string' ||
      item.activityId === undefined ||
      item.activityId === null
    ) {
      continue;
    }
    const activity = await prisma.activity.findFirst({
      where: { athleteId, garminId: String(item.activityId) },
      select: { id: true, rpe: true, feeling: true },
    });
    if (!activity) {
      throw new Error('Garmin file arrived before its activity');
    }
    if (activity.rpe !== null && activity.feeling !== null) {
      continue;
    }
    accessToken ??= await getValidGarminAccessToken(athleteId);
    const { rpe, feeling } = readSelfEvaluation(await downloadFit(item.callbackURL, accessToken));
    const data = {
      ...(activity.rpe === null && rpe !== null ? { rpe } : {}),
      ...(activity.feeling === null && feeling !== null ? { feeling } : {}),
    };
    if (Object.keys(data).length > 0) {
      await prisma.activity.update({ where: { id: activity.id }, data });
    }
  }
}
