import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueOrThrowMock = vi.fn();
const findManyMock = vi.fn();
const findUniqueMock = vi.fn();
const listEvidenceMock = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: {
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowMock(...args),
    },
    activity: { findMany: (...args: unknown[]) => findManyMock(...args) },
    dailyHealth: { findMany: (...args: unknown[]) => findManyMock(...args) },
    dailyNutrition: { findMany: (...args: unknown[]) => findManyMock(...args) },
    foodLogEntry: { findMany: (...args: unknown[]) => findManyMock(...args) },
    foodProduct: { findMany: (...args: unknown[]) => findManyMock(...args) },
    bodyCompositionMeasurement: { findMany: (...args: unknown[]) => findManyMock(...args) },
    goal: { findMany: (...args: unknown[]) => findManyMock(...args) },
    plannedSession: { findMany: (...args: unknown[]) => findManyMock(...args) },
    physicalNote: { findMany: (...args: unknown[]) => findManyMock(...args) },
    healthGround: { findMany: (...args: unknown[]) => findManyMock(...args) },
    bloodTest: { findMany: (...args: unknown[]) => findManyMock(...args) },
    condition: { findMany: (...args: unknown[]) => findManyMock(...args) },
    conversation: { findMany: (...args: unknown[]) => findManyMock(...args) },
    dailyBriefing: { findMany: (...args: unknown[]) => findManyMock(...args) },
    weeklyReview: { findMany: (...args: unknown[]) => findManyMock(...args) },
    performanceRecord: { findMany: (...args: unknown[]) => findManyMock(...args) },
    athleteFeedback: { findMany: (...args: unknown[]) => findManyMock(...args) },
    observation: { findMany: (...args: unknown[]) => findManyMock(...args) },
    athleteDayJournal: { findMany: (...args: unknown[]) => findManyMock(...args) },
    journalHabitExperiment: { findMany: (...args: unknown[]) => findManyMock(...args) },
    foodLogSkippedMeal: { findMany: (...args: unknown[]) => findManyMock(...args) },
    savedMeal: { findMany: (...args: unknown[]) => findManyMock(...args) },
    nutritionDayAnalysis: { findMany: (...args: unknown[]) => findManyMock(...args) },
    trainingPlan: { findMany: (...args: unknown[]) => findManyMock(...args) },
    hikeTrip: { findMany: (...args: unknown[]) => findManyMock(...args) },
    athleteTravelContext: { findMany: (...args: unknown[]) => findManyMock(...args) },
    athleteThresholdSnapshot: { findMany: (...args: unknown[]) => findManyMock(...args) },
    athleteActivityStatus: { findMany: (...args: unknown[]) => findManyMock(...args) },
    athleteActivityStatusHistory: { findMany: (...args: unknown[]) => findManyMock(...args) },
    brickAnalysis: { findMany: (...args: unknown[]) => findManyMock(...args) },
    brickEvaluation: { findMany: (...args: unknown[]) => findManyMock(...args) },
    coachingDecision: { findMany: (...args: unknown[]) => findManyMock(...args) },
    digitalTwin: { findMany: (...args: unknown[]) => findManyMock(...args) },
    calendarBusySnapshot: { findMany: (...args: unknown[]) => findManyMock(...args) },
    subscription: { findMany: (...args: unknown[]) => findManyMock(...args) },
    deviceToken: { findMany: (...args: unknown[]) => findManyMock(...args) },
    garminAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    stravaAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    googleAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    renphoAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    withingsAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

vi.mock('@sharpit/server/lib/science/reliability/analysis-evidence-store', () => ({
  listAnalysisEvidenceForExport: (...args: unknown[]) => listEvidenceMock(...args),
}));

describe('buildAthleteExportJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueOrThrowMock.mockResolvedValue({
      id: 'athlete-1',
      clerkUserId: 'user_1',
      privacyVersion: 'v0-2026-09',
      healthDataConsentAt: new Date('2026-09-01T00:00:00.000Z'),
      aiProcessingConsentAt: null,
      context: null,
    });
    findManyMock.mockResolvedValue([]);
    findUniqueMock.mockResolvedValue(null);
    listEvidenceMock.mockResolvedValue([
      {
        id: 'ev-1',
        athleteId: 'athlete-1',
        trainingDayId: '2026-09-15',
        snapshotId: 'snap-1',
        inputs: {
          sleepNightAgeHours: 8,
          morningHrvAgeHours: 4,
          hrvBaselineDays: 14,
          loadSyncAgeHours: 12,
          loadDaysCoveredIn7: 6,
          recoveryDimensionCount: 4,
          hasSportContext: true,
          intensityAdviceRequested: false,
          gaps: [],
        },
        verdict: {
          overallVerdict: 'TRAIN_SMART',
          confidence: 0.8,
          confidenceTier: 'HIGH',
          packTier: 'FULL',
          rationaleCodes: ['reasoning.topAction.trainSmart.rationale'],
          allowsHardVerdict: true,
        },
        createdAt: new Date('2026-09-15T08:00:00.000Z'),
      },
    ]);
  });

  it('exports analysis evidence under categories.health within retention (no secrets)', async () => {
    const { buildAthleteExportJson } = await import('./export');
    const payload = await buildAthleteExportJson('athlete-1');

    expect(listEvidenceMock).toHaveBeenCalledWith('athlete-1');
    expect(payload.categories.health.analysisEvidenceSnapshots).toHaveLength(1);
    expect(payload.categories.health.analysisEvidenceSnapshots[0]).toMatchObject({
      id: 'ev-1',
      trainingDayId: '2026-09-15',
      verdict: { packTier: 'FULL' },
    });
    expect(payload.categories.health.analysisEvidenceSnapshots[0]).not.toHaveProperty('athleteId');
    expect(JSON.stringify(payload)).not.toMatch(/token|password|secret/i);
    expect(payload.retention.analysisEvidence).toEqual({
      maxRows: 5,
      maxAgeDays: 14,
      note: 'Preuves d’analyse : 5 dernières ou 14 jours (la fenêtre la plus courte).',
    });
  });

  it('accounts for every database model: exported, or left out with a reason', async () => {
    const { EXPORT_COVERED_MODELS, EXPORT_EXCLUDED_MODELS } = await import('./export');
    const accounted = [...EXPORT_COVERED_MODELS, ...Object.keys(EXPORT_EXCLUDED_MODELS)].sort();
    const models = Prisma.dmmf.datamodel.models.map((model) => model.name).sort();

    expect(accounted).toEqual(models);
  });

  it('exports the day journal and observations, and never push tokens', async () => {
    const { buildAthleteExportJson } = await import('./export');
    const payload = await buildAthleteExportJson('athlete-1');

    expect(payload).toHaveProperty('dayJournal');
    expect(payload).toHaveProperty('observations');
    expect(findManyMock).toHaveBeenCalledWith({
      where: { athleteId: 'athlete-1' },
      select: { platform: true, enabled: true, lastUsedAt: true, createdAt: true },
    });
  });
});
