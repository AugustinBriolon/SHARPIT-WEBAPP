import { ProviderAuthError } from '@sharpit/server/lib/integrations/shared/connection-status';

/** Garmin Connect Developer Program, Training API V2 (docs/garmin/Training API V2 2.0). */
const TRAINING_API = 'https://apis.garmin.com/training-api';
/** §3.3 gives the create call its own host path; every other call is under `training-api`. */
const WORKOUT_CREATE = 'https://apis.garmin.com/workoutportal/workout/v2';

const RECONNECT_MESSAGE = 'Session Garmin expirée. Reconnecte Garmin dans les paramètres.';

export type GarminWorkoutPushErrorCode =
  | 'not_found'
  | 'unsupported_sport'
  | 'empty'
  | 'too_many_steps'
  | 'already_pushed'
  | 'not_connected'
  | 'permission'
  | 'rate_limited';

/** A refusal the athlete can act on, with the status the route answers. */
export class GarminWorkoutPushError extends Error {
  constructor(
    readonly code: GarminWorkoutPushErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GarminWorkoutPushError';
  }
}

export const GARMIN_PERMISSION_MESSAGE =
  'SharpIt n’a pas le droit d’envoyer des entraînements sur ta montre. Reconnecte Garmin et autorise l’import d’entraînements.';

async function trainingRequest(
  url: string,
  accessToken: string,
  init: { method: 'POST' | 'DELETE'; body?: unknown },
): Promise<unknown> {
  const response = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (response.status === 401) {
    throw new ProviderAuthError(RECONNECT_MESSAGE);
  }
  if (response.status === 403 || response.status === 412) {
    throw new GarminWorkoutPushError('permission', GARMIN_PERMISSION_MESSAGE, 403);
  }
  if (response.status === 429) {
    throw new GarminWorkoutPushError(
      'rate_limited',
      'Garmin limite les envois pour aujourd’hui. Réessaie plus tard.',
      429,
    );
  }
  if (!response.ok) {
    throw new Error(`Garmin training ${init.method} a répondu ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** Creates the workout in the athlete's Garmin Connect library; returns its id. */
export async function createGarminWorkout(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const body = (await trainingRequest(WORKOUT_CREATE, accessToken, {
    method: 'POST',
    body: payload,
  })) as { workoutId?: unknown } | null;
  if (body?.workoutId === undefined || body.workoutId === null) {
    throw new Error('Garmin workout id absent');
  }
  return String(body.workoutId);
}

/** Puts a workout on the athlete's calendar: the watch picks it up on its next sync. */
export async function scheduleGarminWorkout(
  accessToken: string,
  workoutId: string,
  date: string,
): Promise<void> {
  await trainingRequest(`${TRAINING_API}/schedule`, accessToken, {
    method: 'POST',
    body: { workoutId: Number(workoutId), date },
  });
}

/**
 * Removes a workout from the library. shortcut: we assume Garmin drops its schedules with it,
 * as Connect does; if a replaced session still shows twice, delete the schedule id too.
 */
export async function deleteGarminWorkout(accessToken: string, workoutId: string): Promise<void> {
  await trainingRequest(
    `${TRAINING_API}/workout/v2/${encodeURIComponent(workoutId)}`,
    accessToken,
    {
      method: 'DELETE',
    },
  );
}
