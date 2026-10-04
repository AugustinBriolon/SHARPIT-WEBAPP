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
    condition: { findMany: (...args: unknown[]) => findManyMock(...args) },
    conversation: { findMany: (...args: unknown[]) => findManyMock(...args) },
    dailyBriefing: { findMany: (...args: unknown[]) => findManyMock(...args) },
    weeklyReview: { findMany: (...args: unknown[]) => findManyMock(...args) },
    performanceRecord: { findMany: (...args: unknown[]) => findManyMock(...args) },
    athleteFeedback: { findMany: (...args: unknown[]) => findManyMock(...args) },
    garminAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    stravaAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    googleAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    renphoAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    withingsAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    myFitnessPalAccount: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
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
});
