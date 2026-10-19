import { startOfDay } from 'date-fns';
import { prisma } from '@sharpit/db/client';
import { hasProAccess } from '@sharpit/app/lib/access/tier';

/**
 * FREE athletes get a taste of session analysis, not a spendable pool:
 * activities from before they joined SHARPIT stay Pro-only (that's often a
 * bulk historical import, not something to give away), and even on eligible
 * activities only one analysis lands per day. No stored counter — both
 * checks are computed live from data that already exists (AthleteProfile.tier
 * + createdAt, Activity.narrativeAnalyzedAt).
 */
export const FREE_NARRATIVE_DAILY_LIMIT = 1;

export function isActivityFreeEligible(activityDate: Date, athleteCreatedAt: Date): boolean {
  return startOfDay(activityDate).getTime() >= startOfDay(athleteCreatedAt).getTime();
}

async function countNarrativesGeneratedToday(athleteId: string): Promise<number> {
  const today = startOfDay(new Date());
  return prisma.activity.count({
    where: { athleteId, narrativeAnalyzedAt: { gte: today } },
  });
}

export type NarrativeActivityAccess = { allowed: boolean; isPro: boolean };

/**
 * Read-only check for one activity — used both as the real enforcement
 * (inside runActivityNarrativeAnalysis) and as a route/UI pre-check. Safe to
 * call repeatedly: nothing here is spent or written.
 */
export async function canGenerateNarrativeForActivity(
  athleteId: string,
  activityDate: Date,
): Promise<NarrativeActivityAccess> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { tier: true, createdAt: true },
  });
  if (!profile) {
    return { allowed: false, isPro: false };
  }
  if (hasProAccess(profile.tier)) {
    return { allowed: true, isPro: true };
  }
  if (!isActivityFreeEligible(activityDate, profile.createdAt)) {
    return { allowed: false, isPro: false };
  }
  const generatedToday = await countNarrativesGeneratedToday(athleteId);
  return { allowed: generatedToday < FREE_NARRATIVE_DAILY_LIMIT, isPro: false };
}
