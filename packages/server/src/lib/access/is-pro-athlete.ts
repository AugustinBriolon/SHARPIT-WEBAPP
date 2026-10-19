import { hasProAccess } from '@sharpit/app/lib/access/tier';
import { prisma } from '@sharpit/db/client';

/**
 * Whether the athlete holds SharpIt Pro. Pro gates what SHARPIT adds (analyses, computed
 * metrics), never the athlete's own data.
 */
export async function isProAthlete(athleteId: string): Promise<boolean> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { tier: true },
  });
  return hasProAccess(profile?.tier ?? 'FREE');
}
