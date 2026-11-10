import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Observation } from '@sharpit/core/observation/types';
import { PrismaObservationRepository } from './prisma-observation-repository';

function fakePrisma() {
  const observation = { upsert: vi.fn(() => 'upsert'), deleteMany: vi.fn(() => 'delete') };
  const $transaction = vi.fn();
  return {
    prisma: { observation, $transaction } as unknown as PrismaClient,
    observation,
    $transaction,
  };
}

const base = {
  athleteId: 'a1',
  receivedAt: new Date('2026-11-10T12:00:00Z'),
  trainingDayId: '2026-11-10',
  quality: 'HIGH',
  qualityFlags: [],
  normalizedAt: new Date('2026-11-10T12:00:00Z'),
};

describe('PrismaObservationRepository.save', () => {
  it('replaces earlier readings of the same source and instant when there is no source id', async () => {
    const { prisma, observation, $transaction } = fakePrisma();
    const timestamp = new Date('2026-11-10T06:00:00Z');

    await new PrismaObservationRepository(prisma).save({
      ...base,
      id: 'obs-2',
      type: 'GARMIN_READINESS',
      source: 'GARMIN',
      timestamp,
      score: 70,
    } as unknown as Observation);

    expect(observation.deleteMany).toHaveBeenCalledWith({
      where: {
        athleteId: 'a1',
        type: 'GARMIN_READINESS',
        source: 'GARMIN',
        timestamp,
        externalId: null,
        id: { not: 'obs-2' },
      },
    });
    expect($transaction).toHaveBeenCalledWith(['delete', 'upsert']);
  });

  it('leaves other rows alone when the observation carries a source id', async () => {
    const { prisma, observation, $transaction } = fakePrisma();

    await new PrismaObservationRepository(prisma).save({
      ...base,
      id: 'obs-3',
      type: 'SESSION',
      source: 'GARMIN',
      timestamp: new Date('2026-11-10T07:00:00Z'),
      externalId: 'garmin-1',
    } as unknown as Observation);

    expect(observation.upsert).toHaveBeenCalledTimes(1);
    expect(observation.deleteMany).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });
});
