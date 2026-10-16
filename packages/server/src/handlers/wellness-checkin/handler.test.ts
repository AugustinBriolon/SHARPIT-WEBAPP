import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-lea-demo'),
}));
vi.mock('@sharpit/server/lib/journal/wellness-checkin', () => ({
  getMorningWellnessCheckin: vi.fn(),
  hasMorningWellnessCheckin: vi.fn(),
  submitMorningWellnessCheckin: vi.fn(),
}));
vi.mock('@sharpit/server/lib/validators/training-day-window', () => ({
  resolveAllowedTrainingDayId: vi.fn(),
}));

const URL = 'https://api.sharpit.app/api/v1/wellness-checkin';
const service = () => import('@sharpit/server/lib/journal/wellness-checkin');
const dayWindow = () => import('@sharpit/server/lib/validators/training-day-window');
const auth = () => import('@sharpit/server/lib/auth/current-athlete');

describe('POST /api/v1/wellness-checkin', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked((await dayWindow()).resolveAllowedTrainingDayId).mockResolvedValue({
      ok: true,
      trainingDayId: '2026-10-15',
    });
    vi.mocked((await auth()).getCurrentAthleteId).mockResolvedValue('athlete-lea-demo');
  });

  it('returns additive verdict codes after save (no scale values)', async () => {
    const { POST } = await import('./handler');
    vi.mocked((await service()).submitMorningWellnessCheckin).mockResolvedValue({
      alreadyCompleted: false,
      localDate: '2026-10-15',
      verdict: {
        overallVerdict: 'TRAIN_EASY',
        limitingFactorSystem: 'RECOVERY',
        limitingFactorCode: 'reasoning.limitingFactor.recovery.deficit',
        limiter: 'subjective',
      },
    });

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({
          mood: 2,
          energyLevel: 2,
          perceivedSoreness: 6,
          stressLevel: 4,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.completed).toBe(true);
    expect(body.alreadyCompleted).toBe(false);
    expect(body.verdict).toEqual({
      overallVerdict: 'TRAIN_EASY',
      limitingFactorSystem: 'RECOVERY',
      limitingFactorCode: 'reasoning.limitingFactor.recovery.deficit',
      limiter: 'subjective',
    });
    expect(JSON.stringify(body)).not.toMatch(/perceivedSoreness|energyLevel|notes/i);
  });

  it('stays idempotent on double submit (200 + alreadyCompleted)', async () => {
    const { POST } = await import('./handler');
    vi.mocked((await service()).submitMorningWellnessCheckin).mockResolvedValue({
      alreadyCompleted: true,
      localDate: '2026-10-15',
      verdict: {
        overallVerdict: 'TRAIN_EASY',
        limitingFactorSystem: 'RECOVERY',
        limitingFactorCode: 'reasoning.limitingFactor.recovery.deficit',
        limiter: 'subjective',
      },
    });

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({
          mood: 2,
          energyLevel: 2,
          perceivedSoreness: 6,
          stressLevel: 4,
          trainingDayId: '2026-10-15',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alreadyCompleted).toBe(true);
    expect(body.verdict?.limiter).toBe('subjective');
  });

  it('rejects a training day outside today/yesterday', async () => {
    vi.mocked((await dayWindow()).resolveAllowedTrainingDayId).mockResolvedValue({
      ok: false,
      code: 'TRAINING_DAY_OUT_OF_RANGE',
    });
    const { POST } = await import('./handler');

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({
          mood: 2,
          energyLevel: 2,
          perceivedSoreness: 6,
          stressLevel: 4,
          trainingDayId: '2026-10-01',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('TRAINING_DAY_OUT_OF_RANGE');
    expect((await service()).submitMorningWellnessCheckin).not.toHaveBeenCalled();
  });

  it('ignores client athleteId and keeps the session athlete', async () => {
    const { POST } = await import('./handler');
    const submit = vi.mocked((await service()).submitMorningWellnessCheckin).mockResolvedValue({
      alreadyCompleted: false,
      localDate: '2026-10-15',
      verdict: null,
    });

    await POST(
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({
          mood: 2,
          energyLevel: 2,
          perceivedSoreness: 6,
          stressLevel: 4,
          athleteId: 'other-athlete',
          trainingDayId: '2026-10-15',
        }),
      }),
    );

    expect((await auth()).getCurrentAthleteId).toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith(
      'athlete-lea-demo',
      '2026-10-15',
      expect.objectContaining({ mood: 2 }),
    );
  });

  it('logs failures without health values', async () => {
    const { POST } = await import('./handler');
    vi.mocked((await service()).submitMorningWellnessCheckin).mockRejectedValue(new Error('boom'));

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({
          mood: 1,
          energyLevel: 1,
          perceivedSoreness: 9,
          stressLevel: 5,
          notes: 'Jambe gauche très douloureuse',
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Jambe gauche');
  });
});
