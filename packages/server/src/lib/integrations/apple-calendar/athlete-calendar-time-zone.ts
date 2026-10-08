import { prisma } from '@sharpit/db/client';

const DEFAULT_ATHLETE_TIME_ZONE = 'Europe/Paris';

/**
 * IANA zone for calendar busy labels and free-slot search.
 * AthleteProfile has no timezone column; GoogleAccount.timeZone is set when the athlete
 * linked Google (even if calendar sync later uses Apple only).
 */
export async function resolveAthleteCalendarTimeZone(athleteId: string): Promise<string> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { googleAccount: { select: { timeZone: true } } },
  });
  return profile?.googleAccount?.timeZone ?? DEFAULT_ATHLETE_TIME_ZONE;
}
