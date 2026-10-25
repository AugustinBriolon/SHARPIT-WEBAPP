import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/db/client', () => ({
  prisma: { plannedSession: { findMany: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock('@sharpit/server/lib/decision-memory/repository', () => ({
  createCoachingDecision: vi.fn().mockResolvedValue({ id: 'decision-new' }),
  expireDecision: vi.fn().mockResolvedValue(undefined),
  findCoachingDecisionById: vi.fn(),
  findMorningRecalibrationDecision: vi.fn(),
  recordDecisionAction: vi.fn(),
}));
vi.mock('@sharpit/server/lib/decision-memory/build-snapshot-context', () => ({
  buildDecisionSnapshotContext: vi.fn().mockReturnValue({}),
}));
vi.mock('@sharpit/server/lib/athlete-state/snapshot-service', () => ({
  getOrBuildAthleteSnapshot: vi.fn(),
}));
vi.mock('@sharpit/server/lib/journal/wellness-checkin', () => ({
  hasMorningWellnessCheckin: vi.fn().mockResolvedValue(false),
}));
vi.mock('@sharpit/app/lib/today/rich/morning-orientation', () => ({
  nightEvidenceReady: vi.fn().mockReturnValue(true),
}));
vi.mock('@sharpit/server/lib/queries', () => ({
  updatePlannedSession: vi.fn().mockResolvedValue({}),
}));

const swim = {
  id: 'ps-swim',
  type: 'SWIM',
  intensity: 'ENDURANCE',
  durationMin: 60,
  load: 50,
  title: 'Natation endurance',
  description: null,
  completed: false,
  activityId: null,
  date: new Date('2026-10-02T12:00:00'),
  startTime: null,
  goalId: null,
};

const recoverNight = {
  decision: { overallVerdict: 'RECOVER', confidenceTier: 'HIGH' },
  fatigue: { trainingCapacity: 'REDUCED' },
};

async function deps() {
  const { prisma } = await import('@sharpit/db/client');
  const repo = await import('@sharpit/server/lib/decision-memory/repository');
  const snapshots = await import('@sharpit/server/lib/athlete-state/snapshot-service');
  const night = await import('@sharpit/app/lib/today/rich/morning-orientation');
  return { prisma, repo, snapshots, night };
}

describe('morning recalibration service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma, repo, snapshots, night } = await deps();
    vi.mocked(prisma.plannedSession.findMany).mockResolvedValue([swim] as never);
    vi.mocked(repo.findMorningRecalibrationDecision).mockResolvedValue(null);
    vi.mocked(snapshots.getOrBuildAthleteSnapshot).mockResolvedValue(recoverNight as never);
    vi.mocked(night.nightEvidenceReady).mockReturnValue(true);
  });

  it('proposes once the night is read, without waiting for the check-in', async () => {
    const { ensureMorningRecalibration } = await import('./service');

    const result = await ensureMorningRecalibration('athlete-1', '2026-10-02');

    expect(result.created).toBe(true);
    expect(result.presentation).toMatchObject({
      decisionId: 'decision-new',
      direction: 'DOWN',
      toIntensity: 'RECOVERY',
      toDurationMin: 45,
    });
  });

  it('stays silent while the night is still being read', async () => {
    const { night, repo } = await deps();
    vi.mocked(night.nightEvidenceReady).mockReturnValue(false);
    const { ensureMorningRecalibration } = await import('./service');

    const result = await ensureMorningRecalibration('athlete-1', '2026-10-02');

    expect(result.presentation).toBeNull();
    expect(repo.createCoachingDecision).not.toHaveBeenCalled();
  });

  it('replaces a proposal still waiting once the check-in arrives', async () => {
    const { repo } = await deps();
    vi.mocked(repo.findMorningRecalibrationDecision)
      .mockResolvedValueOnce({ id: 'decision-old', status: 'PRESENTED' } as never)
      .mockResolvedValueOnce({
        id: 'decision-old',
        status: 'EXPIRED',
        proposal: { sessionId: 'ps-swim' },
        snapshotContext: { morningRecalibration: {} },
      } as never);
    const { refreshMorningRecalibrationAfterCheckIn } = await import('./service');

    const result = await refreshMorningRecalibrationAfterCheckIn('athlete-1', '2026-10-02');

    expect(repo.expireDecision).toHaveBeenCalledWith('decision-old');
    expect(result.created).toBe(true);
    expect(result.presentation?.decisionId).toBe('decision-new');
  });

  it('keeps a proposal the athlete already answered', async () => {
    const { repo } = await deps();
    vi.mocked(repo.findMorningRecalibrationDecision).mockResolvedValue({
      id: 'decision-old',
      status: 'ACCEPTED',
      proposal: { sessionId: 'ps-swim', type: 'SWIM' },
      snapshotContext: {
        morningRecalibration: { direction: 'DOWN', changeSummary: 'x', why: 'y' },
      },
    } as never);
    const { prisma } = await deps();
    vi.mocked(prisma.plannedSession.findFirst).mockResolvedValue({ type: 'SWIM' } as never);
    const { refreshMorningRecalibrationAfterCheckIn } = await import('./service');

    const result = await refreshMorningRecalibrationAfterCheckIn('athlete-1', '2026-10-02');

    expect(repo.expireDecision).not.toHaveBeenCalled();
    expect(repo.createCoachingDecision).not.toHaveBeenCalled();
    expect(result.presentation?.status).toBe('ACCEPTED');
  });
});

describe('acceptMorningRecalibration', () => {
  it('writes the lightened length into the run’s steps, not only its duration', async () => {
    const { prisma, repo } = await deps();
    const { updatePlannedSession } = await import('@sharpit/server/lib/queries');
    vi.mocked(repo.findCoachingDecisionById).mockResolvedValue({
      status: 'PRESENTED',
      proposal: { sessionId: 'ps-run', intensity: 'RECOVERY', durationMin: 60, load: 40 },
      snapshotContext: {
        morningRecalibration: { toDescription: 'ancien déroulé', why: 'nuit courte' },
      },
    } as never);
    vi.mocked(prisma.plannedSession.findFirst).mockResolvedValue({
      type: 'RUN',
      durationMin: 80,
      intensity: 'ENDURANCE',
      endurancePrescription: {
        version: 1,
        sport: 'RUN',
        blocks: [
          {
            kind: 'step',
            step: {
              kind: 'warmup',
              duration: { type: 'time', seconds: 900 },
              target: { metric: 'none' },
            },
          },
          {
            kind: 'step',
            step: {
              kind: 'interval',
              duration: { type: 'time', seconds: 3300 },
              target: { metric: 'pace', pctMin: 72.5, pctMax: 87.5 },
            },
          },
          {
            kind: 'step',
            step: {
              kind: 'cooldown',
              duration: { type: 'time', seconds: 600 },
              target: { metric: 'none' },
            },
          },
        ],
      },
    } as never);

    const { acceptMorningRecalibration } = await import('./service');
    await expect(acceptMorningRecalibration('athlete-1', 'decision-1')).resolves.toEqual({
      ok: true,
      sessionId: 'ps-run',
    });
    expect(updatePlannedSession).toHaveBeenCalledWith(
      'athlete-1',
      'ps-run',
      expect.objectContaining({
        durationMin: 60,
        intensity: 'RECOVERY',
        description: '15 min échauffement · 35 min récup · 10 min retour au calme',
        endurancePrescription: expect.objectContaining({ sport: 'RUN' }),
      }),
    );
  });
});
