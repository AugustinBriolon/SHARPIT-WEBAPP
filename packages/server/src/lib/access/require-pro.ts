import { NextResponse } from 'next/server';
import { hasProAccess } from '@sharpit/app/lib/access/tier';
import { prisma } from '@sharpit/db/client';

/** The refusal every Pro-only route answers with; the app and the web key their teaser on it. */
export const PRO_REQUIRED = 'pro_required';

export type RequireProOptions = {
  /**
   * The first week of the onboarding is generated before the paywall (ADR-097): a Free athlete
   * whose wizard is not finished may ask for it. The rolling coach budget still caps the retries.
   */
  allowOnboardingPreview?: boolean;
};

/**
 * 403 `pro_required` when the athlete is not Pro, `null` otherwise. Coaching is Pro-only
 * (ADR-097), so a route calls this before any model work.
 */
export async function requirePro(
  athleteId: string,
  { allowOnboardingPreview = false }: RequireProOptions = {},
): Promise<NextResponse | null> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { tier: true, onboardingCompletedAt: true },
  });
  if (hasProAccess(profile?.tier ?? 'FREE')) {
    return null;
  }
  if (allowOnboardingPreview && profile && profile.onboardingCompletedAt === null) {
    return null;
  }
  return NextResponse.json({ error: PRO_REQUIRED }, { status: 403 });
}
