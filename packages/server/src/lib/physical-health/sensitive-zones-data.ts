import 'server-only';

import { prisma } from '@sharpit/db/client';
import type { AuditableSession } from '@sharpit/app/lib/physical-health/sensitive-zone-audit';
import type { ZoneNote } from '@sharpit/app/lib/physical-health/sensitive-zones-v1';
import { getPhysicalNotes } from '@sharpit/server/lib/queries';

/** The three weeks a plan is written for — what "upcoming" means on the zone. */
const UPCOMING_DAYS = 21;
const DAY_MS = 86_400_000;

export async function loadSensitiveZoneInputs(
  athleteId: string,
  now: Date,
): Promise<{ notes: ZoneNote[]; sessions: AuditableSession[] }> {
  const [notes, sessions] = await Promise.all([
    getPhysicalNotes(athleteId),
    prisma.plannedSession.findMany({
      where: {
        athleteId,
        completed: false,
        date: { gte: now, lte: new Date(now.getTime() + UPCOMING_DAYS * DAY_MS) },
      },
      select: {
        id: true,
        date: true,
        title: true,
        type: true,
        completed: true,
        strengthPrescription: true,
      },
    }),
  ]);
  return { notes, sessions };
}
