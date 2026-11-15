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

describe('PrismaFeatureRepository.findSessionFeaturesByRange', () => {
  const row = (sessionObsId: string) => ({
    id: `fs-${sessionObsId}`,
    athleteId: 'a1',
    category: 'SESSION',
    trainingDayId: '2026-11-10',
    sessionObsId,
    version: 1,
    status: 'COMPUTED',
    confidence: 1,
    algorithmId: 'session-features-v1',
    sourceObsIds: [],
    computedAt: new Date('2026-11-10T08:00:00Z'),
    createdAt: new Date('2026-11-10T08:00:00Z'),
    data: { tssScore: 50 },
  });

  it('leaves out the features of a session whose observation was removed', async () => {
    const prisma = {
      featureSet: { findMany: vi.fn(async () => [row('kept'), row('removed')]) },
      observation: { findMany: vi.fn(async () => [{ id: 'kept' }]) },
    };
    const repo = new PrismaFeatureRepository(prisma as unknown as PrismaClient);

    const records = await repo.findSessionFeaturesByRange('a1', '2026-11-01', '2026-11-10');

    expect(records.map((record) => record.sessionObsId)).toEqual(['kept']);
  });
});
