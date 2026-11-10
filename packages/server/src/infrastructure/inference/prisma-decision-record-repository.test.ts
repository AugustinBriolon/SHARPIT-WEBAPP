import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { DecisionRecord } from '@sharpit/core/inference/types';
import { PrismaDecisionRecordRepository } from './prisma-decision-record-repository';

const record = {
  id: 'run-2',
  athleteId: 'a1',
  trainingDayId: '2026-11-10',
  modelId: 'fatigue-v1',
  modelVersion: 'v1',
  confidence: 0.8,
  signals: {},
  stateUpdate: {},
  decision: {},
  recommendation: {},
  explanation: '',
  inputSummary: {},
  computedAt: new Date('2026-11-10T08:00:00Z'),
  createdAt: new Date('2026-11-10T08:00:00Z'),
} as unknown as DecisionRecord;

describe('PrismaDecisionRecordRepository.save', () => {
  it('replaces the record of the same athlete, model and day instead of appending', async () => {
    const upsert = vi.fn();
    const repo = new PrismaDecisionRecordRepository({
      decisionRecord: { upsert },
    } as unknown as PrismaClient);

    await repo.save(record);

    const [[call]] = upsert.mock.calls;
    expect(call.where).toEqual({
      athleteId_modelId_trainingDayId: {
        athleteId: 'a1',
        modelId: 'fatigue-v1',
        trainingDayId: '2026-11-10',
      },
    });
    expect(call.update.id).toBe('run-2');
    expect(call.update).toEqual(call.create);
  });
});
