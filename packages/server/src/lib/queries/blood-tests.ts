import { prisma } from '@sharpit/db/client';
import { bloodMarkerStatus, type BloodMarkerResult } from '@sharpit/app/lib/blood-markers/catalog';
import { decryptSecret, encryptSecret } from '@sharpit/server/lib/secret-box';
import type { PostBloodTestInput } from '@sharpit/server/lib/validators/blood-test';

/*
 * Blood tests (ADR-128). The results of one test are stored as a single AES-GCM payload, so the
 * database holds neither a value nor which markers were measured. This module is the only reader:
 * `blood-tests.boundary.test.ts` fails when any other code — the coach above all — imports it.
 */

type SealedRow = { id: string; sampledAt: Date; sealedResults: string };

function openBloodTest(row: SealedRow) {
  const results = JSON.parse(decryptSecret(row.sealedResults)) as BloodMarkerResult[];
  return {
    id: row.id,
    sampledAt: row.sampledAt.toISOString(),
    results: results.map((result) => ({ ...result, status: bloodMarkerStatus(result) })),
  };
}

export type BloodTestView = ReturnType<typeof openBloodTest>;

const VIEW_SELECT = { id: true, sampledAt: true, sealedResults: true } as const;

/** Every test of the athlete, latest sampling first — the history is read from this one list. */
export async function listBloodTests(athleteId: string): Promise<BloodTestView[]> {
  const rows = await prisma.bloodTest.findMany({
    where: { athleteId },
    orderBy: { sampledAt: 'desc' },
    select: VIEW_SELECT,
  });
  return rows.map(openBloodTest);
}

export async function createBloodTest(
  athleteId: string,
  input: PostBloodTestInput,
): Promise<BloodTestView> {
  const row = await prisma.bloodTest.create({
    data: {
      athleteId,
      sampledAt: input.sampledAt,
      sealedResults: encryptSecret(JSON.stringify(input.results)),
    },
    select: VIEW_SELECT,
  });
  return openBloodTest(row);
}

/** True when a test of this athlete was deleted. */
export async function deleteBloodTest(athleteId: string, id: string): Promise<boolean> {
  const { count } = await prisma.bloodTest.deleteMany({ where: { id, athleteId } });
  return count > 0;
}

/** Health consent withdrawn: the tests go with it. */
export async function purgeBloodTests(athleteId: string): Promise<void> {
  await prisma.bloodTest.deleteMany({ where: { athleteId } });
}
