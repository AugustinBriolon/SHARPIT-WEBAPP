import { isProAthlete } from '@sharpit/server/lib/access/is-pro-athlete';

export type NarrativeActivityAccess = { allowed: boolean; isPro: boolean };

/**
 * Session analysis is coaching, so it is Pro-only (ADR-097): no Free taste, and no model call
 * for a Free athlete on any path (auto sync, the « Générer » tap, backfill). Read-only, safe to
 * call as both the enforcement and the route or page pre-check.
 */
export async function canGenerateNarrativeForActivity(
  athleteId: string,
): Promise<NarrativeActivityAccess> {
  const isPro = await isProAthlete(athleteId);
  return { allowed: isPro, isPro };
}
