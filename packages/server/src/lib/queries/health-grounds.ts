import { prisma } from '@sharpit/db/client';
import type { PutHealthGroundsInput } from '@sharpit/server/lib/validators/health-ground';

export function getHealthGrounds(athleteId: string) {
  return prisma.healthGround.findMany({ where: { athleteId }, orderBy: { createdAt: 'asc' } });
}

/** Replaces the declared set in one transaction, so a failed write never leaves half of it. */
export async function replaceHealthGrounds(athleteId: string, input: PutHealthGroundsInput) {
  await prisma.$transaction([
    prisma.healthGround.deleteMany({ where: { athleteId } }),
    prisma.healthGround.createMany({
      data: input.grounds.map((ground) => ({ athleteId, ...ground })),
    }),
  ]);
  return getHealthGrounds(athleteId);
}
