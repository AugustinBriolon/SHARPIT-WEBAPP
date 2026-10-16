import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-lea-demo'),
}));
vi.mock('@sharpit/server/lib/morning-recalibration/service', () => ({
  ensureMorningRecalibration: vi.fn().mockResolvedValue({ presentation: null, created: false }),
  getMorningRecalibrationPresentation: vi.fn().mockResolvedValue(null),
}));
vi.mock('@sharpit/server/lib/validators/training-day-window', () => ({
  resolveAllowedTrainingDayId: vi.fn(),
}));

const service = () => import('@sharpit/server/lib/morning-recalibration/service');
const dayWindow = () => import('@sharpit/server/lib/validators/training-day-window');
const auth = () => import('@sharpit/server/lib/auth/current-athlete');

describe('morning-recalibration handler', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked((await dayWindow()).resolveAllowedTrainingDayId).mockResolvedValue({
      ok: true,
      trainingDayId: '2026-10-15',
    });
    vi.mocked((await auth()).getCurrentAthleteId).mockResolvedValue('athlete-lea-demo');
  });

  it('POST accepts today and uses the session athlete', async () => {
    const { POST } = await import('./handler');
    const ensure = vi.mocked((await service()).ensureMorningRecalibration);

    const response = await POST(
      new Request('https://api.sharpit.app/api/v1/morning-recalibration', {
        method: 'POST',
        body: JSON.stringify({
          trainingDayId: '2026-10-15',
          athleteId: 'other-athlete',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(ensure).toHaveBeenCalledWith('athlete-lea-demo', '2026-10-15');
  });

  it('GET rejects a day outside the window', async () => {
    vi.mocked((await dayWindow()).resolveAllowedTrainingDayId).mockResolvedValue({
      ok: false,
      code: 'TRAINING_DAY_OUT_OF_RANGE',
    });
    const { GET } = await import('./handler');

    const response = await GET(
      new Request('https://api.sharpit.app/api/v1/morning-recalibration?trainingDayId=2026-10-01'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('TRAINING_DAY_OUT_OF_RANGE');
    expect((await service()).getMorningRecalibrationPresentation).not.toHaveBeenCalled();
  });

  it('POST rejects a malformed trainingDayId', async () => {
    vi.mocked((await dayWindow()).resolveAllowedTrainingDayId).mockResolvedValue({
      ok: false,
      code: 'INVALID_TRAINING_DAY_FORMAT',
    });
    const { POST } = await import('./handler');

    const response = await POST(
      new Request('https://api.sharpit.app/api/v1/morning-recalibration', {
        method: 'POST',
        body: JSON.stringify({ trainingDayId: 'hier' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_TRAINING_DAY_FORMAT');
  });
});
