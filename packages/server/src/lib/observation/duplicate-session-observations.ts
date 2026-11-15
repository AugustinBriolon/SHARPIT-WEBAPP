/**
 * One outing, one session observation. Two paths used to leave a second one behind for the same
 * activity: every edit of a provider's activity wrote a manual session beside the provider's,
 * and before 2026-10-24 a Garmin import kept the Strava session it merged with. The load adds
 * sessions up, so each duplicate counted the outing again. Both paths are closed; this finds
 * what they left.
 */

export interface ActivityIdentity {
  id: string;
  garminId: string | null;
  stravaId: string | null;
}

export interface SessionObservationRef {
  id: string;
  source: string;
  externalId: string | null;
}

export interface DuplicateSessionPlan {
  /** Observations to delete: the outing keeps another one. */
  remove: SessionObservationRef[];
  /**
   * What the athlete reported (effort, mood) points at a session by its external id. Reports
   * tied to a removed manual session move to the session that stays.
   */
  relink: { from: string; to: string }[];
}

const manualKey = (activityId: string) => `manual:activity:${activityId}`;

/** The observation the outing keeps: Garmin's when it exists, else Strava's. */
function keptProviderObservation(
  activity: ActivityIdentity,
  byKey: ReadonlyMap<string, SessionObservationRef>,
): SessionObservationRef | null {
  const garmin = activity.garminId ? byKey.get(`GARMIN|${activity.garminId}`) : undefined;
  const strava = activity.stravaId ? byKey.get(`STRAVA|${activity.stravaId}`) : undefined;
  return garmin ?? strava ?? null;
}

/**
 * Nothing is removed for an activity whose only observation is the manual one: an outing must
 * never end with no session at all.
 */
export function planDuplicateSessionRemoval(
  activities: readonly ActivityIdentity[],
  observations: readonly SessionObservationRef[],
): DuplicateSessionPlan {
  const byKey = new Map(observations.map((o) => [`${o.source}|${o.externalId}`, o]));
  const plan: DuplicateSessionPlan = { remove: [], relink: [] };

  for (const activity of activities) {
    const kept = keptProviderObservation(activity, byKey);
    if (!kept?.externalId) {
      continue;
    }
    const manual = byKey.get(`MANUAL|${manualKey(activity.id)}`);
    if (manual) {
      plan.remove.push(manual);
      plan.relink.push({ from: manualKey(activity.id), to: kept.externalId });
    }
    const strava = activity.stravaId ? byKey.get(`STRAVA|${activity.stravaId}`) : undefined;
    if (strava && strava.id !== kept.id) {
      plan.remove.push(strava);
    }
  }
  return plan;
}
