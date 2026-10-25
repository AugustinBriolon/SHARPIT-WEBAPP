import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, getGarminAccount, getValidGarminAccessToken, api } = vi.hoisted(() => ({
  prisma: {
    plannedSession: { findFirst: vi.fn(), update: vi.fn() },
    athleteProfile: { findUnique: vi.fn() },
  },
  getGarminAccount: vi.fn(),
  getValidGarminAccessToken: vi.fn(),
  api: {
    createGarminWorkout: vi.fn(),
    scheduleGarminWorkout: vi.fn(),
    deleteGarminWorkout: vi.fn(),
  },
}));

vi.mock('@sharpit/db/client', () => ({ prisma }));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-sync', () => ({
  getGarminAccount,
  getValidGarminAccessToken,
}));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-training-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...api,
}));

const { pushPlannedSessionToGarmin } = await import('./garmin-workout-push');

const RUN_SESSION = {
  id: 'ps-1',
  type: 'RUN',
  title: 'Seuil',
  date: new Date('2026-10-27T00:00:00.000Z'),
  description: null,
  durationMin: 45,
  intensity: 'MODERATE',
  endurancePrescription: null,
  garminWorkoutId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.plannedSession.findFirst.mockResolvedValue(RUN_SESSION);
  prisma.athleteProfile.findUnique.mockResolvedValue({
    runThresholdPaceSecPerKm: 240,
    swimCssSecPer100m: null,
    ftpW: null,
    lthr: 165,
    maxHr: 190,
    defaultPoolLengthM: null,
  });
  getGarminAccount.mockResolvedValue({ permissions: ['ACTIVITY_EXPORT', 'WORKOUT_IMPORT'] });
  getValidGarminAccessToken.mockResolvedValue('token');
  api.createGarminWorkout.mockResolvedValue('9001');
  api.scheduleGarminWorkout.mockResolvedValue(undefined);
  api.deleteGarminWorkout.mockResolvedValue(undefined);
});

describe('pushPlannedSessionToGarmin', () => {
  it('creates the workout, schedules it on the session day and keeps the receipt', async () => {
    const receipt = await pushPlannedSessionToGarmin('athlete-1', { plannedSessionId: 'ps-1' });

    expect(receipt).toMatchObject({
      workoutId: '9001',
      scheduledDate: '2026-10-27',
      derived: true,
    });
    expect(api.scheduleGarminWorkout).toHaveBeenCalledWith('token', '9001', '2026-10-27');
    expect(prisma.plannedSession.update).toHaveBeenCalledWith({
      where: { id: 'ps-1' },
      data: expect.objectContaining({
        garminWorkoutId: '9001',
        garminWorkoutScheduledDate: '2026-10-27',
        garminWorkoutThresholds: expect.objectContaining({ runThresholdPaceSecPerKm: 240 }),
      }),
    });
  });

  it('refuses a second send unless asked to replace, without calling Garmin', async () => {
    prisma.plannedSession.findFirst.mockResolvedValue({ ...RUN_SESSION, garminWorkoutId: '7' });
    await expect(
      pushPlannedSessionToGarmin('athlete-1', { plannedSessionId: 'ps-1' }),
    ).rejects.toMatchObject({ code: 'already_pushed', status: 409 });
    expect(api.createGarminWorkout).not.toHaveBeenCalled();
  });

  it('replaces: deletes the workout sent before, then sends again', async () => {
    prisma.plannedSession.findFirst.mockResolvedValue({ ...RUN_SESSION, garminWorkoutId: '7' });
    await pushPlannedSessionToGarmin('athlete-1', { plannedSessionId: 'ps-1', replace: true });
    expect(api.deleteGarminWorkout).toHaveBeenCalledWith('token', '7');
    expect(api.createGarminWorkout).toHaveBeenCalled();
  });

  it('refuses when the athlete did not grant the workout import', async () => {
    getGarminAccount.mockResolvedValue({ permissions: ['ACTIVITY_EXPORT'] });
    await expect(
      pushPlannedSessionToGarmin('athlete-1', { plannedSessionId: 'ps-1' }),
    ).rejects.toMatchObject({ code: 'permission', status: 403 });
  });

  it('refuses when Garmin is not connected', async () => {
    getGarminAccount.mockResolvedValue(null);
    await expect(
      pushPlannedSessionToGarmin('athlete-1', { plannedSessionId: 'ps-1' }),
    ).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('refuses a strength session for now', async () => {
    prisma.plannedSession.findFirst.mockResolvedValue({ ...RUN_SESSION, type: 'STRENGTH' });
    await expect(
      pushPlannedSessionToGarmin('athlete-1', { plannedSessionId: 'ps-1' }),
    ).rejects.toMatchObject({ code: 'unsupported_sport', status: 422 });
  });

  it('removes a created workout again when it cannot be scheduled, and keeps no receipt', async () => {
    api.scheduleGarminWorkout.mockRejectedValue(new Error('Garmin training POST a répondu 500'));
    await expect(
      pushPlannedSessionToGarmin('athlete-1', { plannedSessionId: 'ps-1' }),
    ).rejects.toThrow('500');
    expect(api.deleteGarminWorkout).toHaveBeenCalledWith('token', '9001');
    expect(prisma.plannedSession.update).not.toHaveBeenCalled();
  });
});
