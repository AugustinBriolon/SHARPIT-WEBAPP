import type { Prisma } from '@prisma/client';
import {
  primaryForClass,
  type IntegrationSourcePrefs,
} from '@sharpit/app/lib/integrations/source-prefs';
import {
  fillMissingActivityUpdate,
  fillMissingScalar,
  type ActivityFillSnapshot,
} from '@sharpit/server/lib/activity/list/activity-fill-missing';

/** What the athlete may have written themselves: no source ever replaces it, only fills it. */
const ATHLETE_OWNED_KEYS = ['title', 'rpe', 'feeling', 'notes'] as const;

/** Garmin leads a session another source recorded too when it is the activities' primary, or none is set. */
export function garminLeadsActivities(prefs: IntegrationSourcePrefs): boolean {
  return (primaryForClass(prefs, 'activities') ?? 'garmin') === 'garmin';
}

/**
 * Garmin's patch for a session another source recorded first (ADR-103). Leading, its measures
 * replace the other source's; otherwise it only fills what is blank. Its id and the merged source
 * always land, and the athlete's own words and ratings always stay.
 */
export function garminMergePatch(
  existing: ActivityFillSnapshot,
  enrichment: Prisma.ActivityUpdateInput,
  leads: boolean,
): Prisma.ActivityUpdateInput {
  if (!leads) {
    return fillMissingActivityUpdate(existing, enrichment, { always: ['garminId', 'source'] });
  }
  const patch: Record<string, unknown> = { ...enrichment };
  for (const key of ATHLETE_OWNED_KEYS) {
    const filled = fillMissingScalar(existing[key], patch[key] as string | number | null);
    if (filled === undefined) {
      delete patch[key];
    } else {
      patch[key] = filled;
    }
  }
  return patch as Prisma.ActivityUpdateInput;
}
