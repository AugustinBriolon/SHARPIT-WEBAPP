import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();
const count = vi.fn();
const set = vi.fn();
const sendPushToAthlete = vi.fn().mockResolvedValue({ sent: 1, failed: 0, deactivated: 0 });

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: { findUnique },
    plannedSession: { findMany, findFirst },
    activity: { count },
  },
}));
vi.mock('@sharpit/server/lib/redis', () => ({ redis: { set } }));
vi.mock('@sharpit/server/lib/push/athlete-push', () => ({ sendPushToAthlete }));
const loadWeekProgress = vi.fn().mockResolvedValue({ done: 3, planned: 5 });
vi.mock('@sharpit/server/lib/planned-session/adherence/plan-adherence-service', () => ({
  loadWeekProgress,
}));

const {
  activityPath,
  CATCH_UP_PATH,
  notifyMissedSessions,
  notifySessionsDone,
  notifySourcesToReconnect,
  notifyWeeklyReviewReady,
  reconnectAlert,
  reconnectableSources,
  SOURCES_PATH,
  WEEKLY_REVIEW_PATH,
} = await import('./athlete-notifications');

const profile = (prefs: object | null = null) => ({ notificationPrefs: prefs, deletedAt: null });

describe('athlete notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    findUnique.mockResolvedValue(profile());
    set.mockResolvedValue('OK');
  });

  it('names a source once, Garmin’s two syncs as one Garmin', () => {
    expect(reconnectableSources(['Garmin', 'Garmin activities', 'Strava'])).toEqual([
      'Garmin',
      'Strava',
    ]);
    expect(reconnectAlert(['Garmin']).title).toBe('Garmin s’est déconnecté');
    expect(reconnectAlert(['Garmin', 'Strava', 'Withings']).title).toBe(
      'Garmin, Strava et Withings se sont déconnectés',
    );
  });

  it('says which sources to reconnect, and opens the sources', async () => {
    await notifySourcesToReconnect('a1', ['Garmin', 'Garmin activities']);
    expect(sendPushToAthlete).toHaveBeenCalledTimes(1);
    const [[, payload]] = sendPushToAthlete.mock.calls;
    expect(payload.aps.alert.title).toBe('Garmin s’est déconnecté');
    expect(payload.url).toBe(SOURCES_PATH);
  });

  it('does not say it again within three days', async () => {
    set.mockResolvedValue(null);
    await notifySourcesToReconnect('a1', ['Garmin']);
    expect(sendPushToAthlete).not.toHaveBeenCalled();
  });

  it('respects a switched-off preference', async () => {
    findUnique.mockResolvedValue(profile({ version: 1, syncAlerts: false, weeklyReview: false }));
    await notifySourcesToReconnect('a1', ['Garmin']);
    await notifyWeeklyReviewReady('a1', '2026-09-28');
    expect(sendPushToAthlete).not.toHaveBeenCalled();
  });

  it('announces the weekly review once a week, opening it', async () => {
    await notifyWeeklyReviewReady('a1', '2026-09-28');
    expect(set).toHaveBeenCalledWith(
      'push:weekly-review:a1:2026-09-28',
      1,
      expect.objectContaining({ nx: true }),
    );
    expect(sendPushToAthlete.mock.calls[0][1].url).toBe(WEEKLY_REVIEW_PATH);
  });
});

describe('notifySessionsDone', () => {
  const linked = (id: string, day: string, durationMin = 50, doneSec = 46 * 60) => ({
    id,
    date: new Date(`${day}T00:00:00.000Z`),
    durationMin,
    activityId: `act-${id}`,
    activity: { duration: doneSec },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    findUnique.mockResolvedValue(profile());
    set.mockResolvedValue('OK');
    findFirst.mockResolvedValue({
      type: 'BIKE',
      intensity: 'ENDURANCE',
      date: new Date('2026-10-02T00:00:00.000Z'),
    });
  });

  it('says the session counted and what comes next, opening the activity', async () => {
    findMany.mockResolvedValue([linked('s1', '2026-10-01')]);
    await notifySessionsDone('a1', ['s1'], '2026-10-01');
    expect(sendPushToAthlete).toHaveBeenCalledWith('a1', {
      aps: {
        alert: {
          title: 'Séance dans la boîte · 92 % du plan',
          body: '3 sur 5 cette semaine. On se retrouve demain pour ton vélo endurance.',
        },
        sound: 'default',
        'thread-id': 'session-done',
        category: 'SESSION_DONE',
      },
      url: activityPath('act-s1'),
    });
  });

  it('stays quiet about a session older than yesterday — a history import', async () => {
    findMany.mockResolvedValue([linked('s1', '2026-09-20')]);
    await notifySessionsDone('a1', ['s1'], '2026-10-01');
    expect(sendPushToAthlete).not.toHaveBeenCalled();
  });

  it('says each session once', async () => {
    findMany.mockResolvedValue([linked('s1', '2026-09-30')]);
    set.mockResolvedValue(null);
    await notifySessionsDone('a1', ['s1'], '2026-10-01');
    expect(set).toHaveBeenCalledWith(
      'push:session-done:s1',
      1,
      expect.objectContaining({ nx: true }),
    );
    expect(sendPushToAthlete).not.toHaveBeenCalled();
  });

  it('respects a switched-off preference', async () => {
    findUnique.mockResolvedValue(profile({ version: 1, sessionDone: false }));
    await notifySessionsDone('a1', ['s1'], '2026-10-01');
    expect(findMany).not.toHaveBeenCalled();
    expect(sendPushToAthlete).not.toHaveBeenCalled();
  });
});

describe('notifyMissedSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    findUnique.mockResolvedValue(profile());
    set.mockResolvedValue('OK');
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([{ type: 'RUN', intensity: 'THRESHOLD', brickGroupId: null }]);
  });

  it('regrets yesterday’s session and opens the catch-up with it', async () => {
    await notifyMissedSessions('a1', '2026-10-02');
    expect(findMany.mock.calls[0][0].where.date).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(sendPushToAthlete).toHaveBeenCalledWith('a1', {
      aps: {
        alert: {
          title: 'Dommage pour hier',
          body: 'Ta course seuil n’a pas eu lieu. On réorganise ta semaine ensemble ?',
        },
        sound: 'default',
        'thread-id': 'missed-session',
        category: 'MISSED_SESSION',
      },
      url: CATCH_UP_PATH,
      catchUp: { label: 'Course seuil', day: '2026-10-01' },
    });
  });

  it('stays quiet when the athlete trained anyway', async () => {
    count.mockResolvedValue(1);
    await notifyMissedSessions('a1', '2026-10-02');
    expect(sendPushToAthlete).not.toHaveBeenCalled();
  });

  it('says it once a day', async () => {
    set.mockResolvedValue(null);
    await notifyMissedSessions('a1', '2026-10-02');
    expect(set).toHaveBeenCalledWith(
      'push:missed-session:a1:2026-10-01',
      1,
      expect.objectContaining({ nx: true }),
    );
    expect(sendPushToAthlete).not.toHaveBeenCalled();
  });

  it('respects a switched-off preference', async () => {
    findUnique.mockResolvedValue(profile({ version: 1, missedSession: false }));
    await notifyMissedSessions('a1', '2026-10-02');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('wakeAppForWidgets', () => {
  it('sends a silent push the app answers by reading today', async () => {
    const { wakeAppForWidgets } = await import('./athlete-notifications');
    sendPushToAthlete.mockClear();
    await wakeAppForWidgets('a1');
    expect(sendPushToAthlete).toHaveBeenCalledWith('a1', {
      aps: { 'content-available': 1 },
      refresh: 'today',
    });
  });
});
