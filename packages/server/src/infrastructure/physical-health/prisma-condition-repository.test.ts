import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaConditionRepository } from './prisma-condition-repository';

function fakePrisma() {
  const findMany = vi.fn().mockResolvedValue([]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = { condition: { findMany, updateMany } } as unknown as PrismaClient;
  return { prisma, findMany, updateMany };
}

// An unscoped read fed every athlete's conditions into every other athlete's physical-health
// state, and the coach programmed for injuries the athlete never had (ADR-093).
describe('PrismaConditionRepository', () => {
  it('reads only the athlete’s conditions for inference', async () => {
    const { prisma, findMany } = fakePrisma();

    await new PrismaConditionRepository(prisma).findAllForInference('athlete-b', '2026-10-18');

    expect(findMany.mock.calls[0]?.[0]?.where).toEqual({ athleteId: 'athlete-b' });
  });

  it('reads only the athlete’s open conditions for the feature history', async () => {
    const { prisma, findMany } = fakePrisma();

    await new PrismaConditionRepository(prisma).getConditionHistoryForFeatures(
      'athlete-b',
      '2026-10-18',
    );

    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ athleteId: 'athlete-b' });
  });

  it('writes inferred state onto the athlete’s own rows only', async () => {
    const { prisma, updateMany } = fakePrisma();

    await new PrismaConditionRepository(prisma).applyInferredUpdates('athlete-b', [
      {
        conditionId: 'cond-of-athlete-a',
        severity: 2,
        status: 'ACTIVE',
        confidence: 0.5,
        estimatedRecoveryDays: null,
        recurrenceCount: 0,
        lastObservationAt: null,
      },
    ]);

    expect(updateMany.mock.calls[0]?.[0]?.where).toEqual({
      id: 'cond-of-athlete-a',
      athleteId: 'athlete-b',
    });
  });
});
