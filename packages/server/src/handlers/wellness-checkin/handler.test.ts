import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-a'),
}));
vi.mock('@sharpit/server/lib/journal/wellness-checkin', () => ({
  getMorningWellnessCheckin: vi.fn(),
  hasMorningWellnessCheckin: vi.fn(),
  submitMorningWellnessCheckin: vi.fn(),
  todayTrainingDayIdForAthlete: vi.fn().mockResolvedValue('2026-10-15'),
}));

const URL = 'https://api.sharpit.app/api/v1/wellness-checkin';
const service = () => import('@sharpit/server/lib/journal/wellness-checkin');

describe('POST /api/v1/wellness-checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
