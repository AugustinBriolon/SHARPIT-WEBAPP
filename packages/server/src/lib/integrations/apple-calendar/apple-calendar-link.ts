import 'server-only';

import {
  enableProviderForAllCoveredClasses,
  removeProviderEverywhere,
} from '@sharpit/app/lib/integrations/source-prefs';
import { prisma } from '@sharpit/db/client';
import { persistSourcePrefsMutation } from '@sharpit/server/lib/integrations/source-prefs-store';

/**
 * Apple Calendar has no account to connect: the iPhone app says when EventKit is linked.
 * Linking for the first time enables it for every class it covers — same as Apple Health
 * (ADR-027 / ADR-054 pattern). Unlinking removes it from every class. Idempotent both ways.
 */
export async function linkAppleCalendar(athleteId: string, linked: boolean): Promise<void> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { appleCalendarLinkedAt: true },
  });
  const isLinked = Boolean(profile?.appleCalendarLinkedAt);
  if (linked === isLinked) {
    return;
  }
  await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: { appleCalendarLinkedAt: linked ? new Date() : null },
  });
  await persistSourcePrefsMutation(athleteId, (current) =>
    linked
      ? enableProviderForAllCoveredClasses(current, 'apple-calendar')
      : removeProviderEverywhere(current, 'apple-calendar'),
  );
}
