import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { FeatureSetRecord } from '@sharpit/core/features/types';
import { PrismaFeatureRepository } from './prisma-feature-repository';

function recordWith(status: string) {
  return {
    id: 'fs-3',
    athleteId: 'a1',
    category: 'LOAD',
    trainingDayId: '2026-11-10',
    version: 3,
    status,
    computedAt: new Date('2026-11-10T08:00:00Z'),
    data: { confidence: 1, algorithmId: 'load-v1', sourceObsIds: [] },
  } as unknown as FeatureSetRecord;
}

function repoWithFake() {
  const featureSet = { upsert: vi.fn(), deleteMany: vi.fn() };
  const repo = new PrismaFeatureRepository({ featureSet } as unknown as PrismaClient);
  return { repo, featureSet };
}

describe('PrismaFeatureRepository.save', () => {
  it('drops the versions a COMPUTED record supersedes', async () => {
    const { repo, featureSet } = repoWithFake();

    await repo.save(recordWith('COMPUTED'));

    expect(featureSet.deleteMany).toHaveBeenCalledWith({
      where: {
        athleteId: 'a1',
        category: 'LOAD',
        trainingDayId: '2026-11-10',
        sessionObsId: null,
        version: { lte: 3 },
        id: { not: 'fs-3' },
      },
    });
  });

  it('keeps earlier versions while the new one is not COMPUTED', async () => {
    const { repo, featureSet } = repoWithFake();

    await repo.save(recordWith('INVALIDATED'));

    expect(featureSet.deleteMany).not.toHaveBeenCalled();
  });
});
