import { beforeEach, describe, expect, it, vi } from 'vitest';

const activity = { findFirst: vi.fn(), update: vi.fn() };
const readSelfEvaluation = vi.fn();
const getValidGarminAccessToken = vi.fn();
const fetchMock = vi.fn();

vi.mock('@sharpit/db/client', () => ({ prisma: { activity } }));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-fit-evaluation', () => ({
  readSelfEvaluation,
}));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-sync', () => ({
  getValidGarminAccessToken,
}));

const FILE = {
  userId: 'u1',
  activityId: 42,
  fileType: 'FIT',
  callbackURL: 'https://apis.garmin.com/wellness-api/rest/activityFile?id=abc',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  getValidGarminAccessToken.mockResolvedValue('token');
  fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  readSelfEvaluation.mockReturnValue({ rpe: 6, feeling: 'Bien' });
});

describe('processActivityFiles', () => {
  it('fills the effort and the feel the activity has none of', async () => {
    activity.findFirst.mockResolvedValue({ id: 'a1', rpe: null, feeling: null });
    const { processActivityFiles } = await import('./garmin-activity-files');
    await processActivityFiles('ath', [FILE]);

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer token' });
    expect(activity.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { rpe: 6, feeling: 'Bien' },
    });
  });

  it('never overwrites what the athlete wrote', async () => {
    activity.findFirst.mockResolvedValue({ id: 'a1', rpe: 3, feeling: null });
    const { processActivityFiles } = await import('./garmin-activity-files');
    await processActivityFiles('ath', [FILE]);
    expect(activity.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { feeling: 'Bien' },
    });

    activity.update.mockClear();
    activity.findFirst.mockResolvedValue({ id: 'a1', rpe: 3, feeling: 'Mal' });
    await processActivityFiles('ath', [FILE]);
    expect(activity.update).not.toHaveBeenCalled();
  });

  it('throws when the activity is not there yet, so the inbox replays the row', async () => {
    activity.findFirst.mockResolvedValue(null);
    const { processActivityFiles } = await import('./garmin-activity-files');
    await expect(processActivityFiles('ath', [FILE])).rejects.toThrow('before its activity');
  });

  it('sends the token to Garmin only', async () => {
    activity.findFirst.mockResolvedValue({ id: 'a1', rpe: null, feeling: null });
    const { processActivityFiles } = await import('./garmin-activity-files');
    await expect(
      processActivityFiles('ath', [{ ...FILE, callbackURL: 'https://evil.example/file' }]),
    ).rejects.toThrow('refused');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a file that is not a FIT', async () => {
    const { processActivityFiles } = await import('./garmin-activity-files');
    await processActivityFiles('ath', [{ ...FILE, fileType: 'TCX' }]);
    expect(activity.findFirst).not.toHaveBeenCalled();
  });
});
