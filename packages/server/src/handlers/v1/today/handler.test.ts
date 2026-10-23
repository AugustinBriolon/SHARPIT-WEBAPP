import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { format } from 'date-fns';
import { todayIsoDate } from '@sharpit/app/lib/health/activity-status';

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));

vi.mock('@sharpit/server/lib/morning-recalibration/service', () => ({
  getMorningRecalibrationPresentation: vi.fn().mockResolvedValue(null),
  ensureMorningRecalibration: vi.fn().mockResolvedValue({ presentation: null, created: false }),
  isMorningCheckInDone: vi.fn().mockResolvedValue(true),
}));

vi.mock('@sharpit/server/lib/presentation/today/today', () => ({
  buildTodayPresentationViewModel: vi.fn(),
}));

vi.mock('@sharpit/server/lib/presentation/v1/today', () => ({
  projectV1TodayFromViewModel: vi.fn().mockReturnValue({
    apiVersion: 1,
    trainingDayId: '2026-09-10',
    empty: null,
    verdict: {
      eyebrow: '',
      headline: 'ok',
      subline: '',
      posture: 'steady',
      confidencePct: null,
      limitingCause: null,
    },
    weather: null,
    sessions: [],
    signals: [],
  }),
}));

const afterMock = vi.hoisted(() => vi.fn());
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: afterMock,
}));

vi.mock('@sharpit/server/lib/planned-session/linking/session-linking', () => ({
  autoLinkActivitiesOfDay: vi.fn().mockResolvedValue([]),
  analyzeLinkedPlannedSessions: vi.fn().mockResolvedValue(0),
}));

vi.mock('@sharpit/server/lib/queries', () => ({
  getActivitiesList: vi.fn().mockResolvedValue([]),
  getHealthEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock('@sharpit/server/lib/athlete-state/snapshot-service', () => ({
  getOrBuildAthleteSnapshot: vi.fn().mockResolvedValue({}),
}));

async function importRoute() {
  return await import('./handler');
}

describe('GET /api/v1/today', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing trainingDayId', async () => {
    const { GET } = await importRoute();
    const response = await GET(new NextRequest('http://localhost/api/v1/today'));
    expect(response.status).toBe(400);
  });

  it('returns projected v1 JSON, not viewModel', async () => {
    const { buildTodayPresentationViewModel } =
      await import('@sharpit/server/lib/presentation/today/today');
    vi.mocked(buildTodayPresentationViewModel).mockResolvedValue({} as never);
    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest('http://localhost/api/v1/today?trainingDayId=2026-09-10'),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.apiVersion).toBe(1);
    expect(body.viewModel).toBeUndefined();
  });

  it('hands iOS the canonical origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://sharpit.app/');
    const { buildTodayPresentationViewModel } =
      await import('@sharpit/server/lib/presentation/today/today');
    const { projectV1TodayFromViewModel } =
      await import('@sharpit/server/lib/presentation/v1/today');
    vi.mocked(buildTodayPresentationViewModel).mockResolvedValue({} as never);

    const { GET } = await importRoute();
    await GET(new NextRequest('http://localhost/api/v1/today?trainingDayId=2026-09-10'));

    expect(vi.mocked(projectV1TodayFromViewModel).mock.calls[0][1]).toMatchObject({
      webOrigin: 'https://sharpit.app',
    });
    vi.unstubAllEnvs();
  });

  describe('auto-link', () => {
    const liveDay = todayIsoDate();
    const request = () => new NextRequest(`http://localhost/api/v1/today?trainingDayId=${liveDay}`);

    it('links the requested day’s activities before building the view', async () => {
      const linking = await import('@sharpit/server/lib/planned-session/linking/session-linking');
      const { buildTodayPresentationViewModel } =
        await import('@sharpit/server/lib/presentation/today/today');
      const order: string[] = [];
      vi.mocked(linking.autoLinkActivitiesOfDay).mockImplementation(async () => {
        order.push('link');
        return [];
      });
      vi.mocked(buildTodayPresentationViewModel).mockImplementation(async () => {
        order.push('build');
        return {} as never;
      });

      const { GET } = await importRoute();
      await GET(request());

      expect(order).toEqual(['link', 'build']);
      const [[athleteId, day]] = vi.mocked(linking.autoLinkActivitiesOfDay).mock.calls;
      expect(athleteId).toBe('athlete-1');
      expect(format(day, 'yyyy-MM-dd')).toBe(liveDay);
    });

    it('leaves a settled day as it is', async () => {
      const linking = await import('@sharpit/server/lib/planned-session/linking/session-linking');

      const { GET } = await importRoute();
      await GET(new NextRequest('http://localhost/api/v1/today?trainingDayId=2026-05-02'));

      expect(linking.autoLinkActivitiesOfDay).not.toHaveBeenCalled();
    });

    it('schedules the compliance analysis for what it linked', async () => {
      const linking = await import('@sharpit/server/lib/planned-session/linking/session-linking');
      vi.mocked(linking.autoLinkActivitiesOfDay).mockResolvedValue(['session-1']);

      const { GET } = await importRoute();
      await GET(request());

      expect(afterMock).toHaveBeenCalledTimes(1);
      await afterMock.mock.calls[0][0]();
      expect(linking.analyzeLinkedPlannedSessions).toHaveBeenCalledWith('athlete-1', ['session-1']);
    });

    it('schedules nothing when nothing was linked', async () => {
      const linking = await import('@sharpit/server/lib/planned-session/linking/session-linking');
      vi.mocked(linking.autoLinkActivitiesOfDay).mockResolvedValue([]);

      const { GET } = await importRoute();
      await GET(request());

      expect(afterMock).not.toHaveBeenCalled();
    });

    it('still answers when linking fails', async () => {
      const linking = await import('@sharpit/server/lib/planned-session/linking/session-linking');
      vi.mocked(linking.autoLinkActivitiesOfDay).mockRejectedValue(new Error('db down'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const { GET } = await importRoute();
      const response = await GET(request());

      expect(response.status).toBe(200);
    });
  });

  it('reads the 60 days up to the day asked for, not up to today', async () => {
    const queries = await import('@sharpit/server/lib/queries');

    const { GET } = await importRoute();
    await GET(new NextRequest('http://localhost/api/v1/today?trainingDayId=2026-05-02'));

    const [[, window]] = vi.mocked(queries.getActivitiesList).mock.calls;
    expect(format(window!.after!, 'yyyy-MM-dd')).toBe('2026-03-03');
    expect(format(window!.before!, 'yyyy-MM-dd')).toBe('2026-05-03');
  });

  it('says where the request spent its time', async () => {
    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest('http://localhost/api/v1/today?trainingDayId=2026-09-10'),
    );

    expect(response.headers.get('server-timing')).toMatch(/^auth;dur=\d+, .*today;dur=\d+$/);
  });

  describe('morning proposal', () => {
    const presentation = { decisionId: 'd1', status: 'PRESENTED' };

    it('writes today’s proposal as soon as the night is read, and says the check-in is to do', async () => {
      const morning = await import('@sharpit/server/lib/morning-recalibration/service');
      const { buildTodayPresentationViewModel } =
        await import('@sharpit/server/lib/presentation/today/today');
      const { projectV1TodayFromViewModel } =
        await import('@sharpit/server/lib/presentation/v1/today');
      vi.mocked(morning.ensureMorningRecalibration).mockResolvedValue({
        presentation: presentation as never,
        created: true,
      });
      vi.mocked(morning.isMorningCheckInDone).mockResolvedValue(false);
      vi.mocked(buildTodayPresentationViewModel).mockResolvedValue({} as never);
      const today = new Date().toISOString().slice(0, 10);

      const { GET } = await importRoute();
      await GET(new NextRequest(`http://localhost/api/v1/today?trainingDayId=${today}`));

      expect(morning.ensureMorningRecalibration).toHaveBeenCalledWith('athlete-1', today);
      expect(vi.mocked(buildTodayPresentationViewModel).mock.calls[0][2]).toMatchObject({
        morningRecalibration: presentation,
      });
      expect(vi.mocked(projectV1TodayFromViewModel).mock.calls[0][1]).toMatchObject({
        morningCheckInDone: false,
      });
    });

    it('only reads a proposal on a day long past', async () => {
      const morning = await import('@sharpit/server/lib/morning-recalibration/service');
      const { buildTodayPresentationViewModel } =
        await import('@sharpit/server/lib/presentation/today/today');
      vi.mocked(buildTodayPresentationViewModel).mockResolvedValue({} as never);

      const { GET } = await importRoute();
      await GET(new NextRequest('http://localhost/api/v1/today?trainingDayId=2026-01-10'));

      expect(morning.ensureMorningRecalibration).not.toHaveBeenCalled();
      expect(morning.getMorningRecalibrationPresentation).toHaveBeenCalledWith(
        'athlete-1',
        '2026-01-10',
      );
    });
  });
});
