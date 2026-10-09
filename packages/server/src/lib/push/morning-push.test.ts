import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildMorningPushPayload,
  morningProposalLine,
  toApnsPayload,
  sendMorningPushForAthlete,
  sendMorningPushOnceNightIsRead,
  sendMorningVerdictPushes,
} from './morning-push';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import { prisma } from '@sharpit/db/client';
import * as apnsModule from '@sharpit/server/lib/push/apns';
import * as snapshotRepo from '@sharpit/server/infrastructure/athlete-state/snapshot-repository';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    deviceToken: {
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    dailyHealth: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@sharpit/server/lib/morning-recalibration/service', () => ({
  ensureMorningRecalibration: vi.fn().mockResolvedValue({ presentation: null, created: false }),
}));

vi.mock('@sharpit/server/lib/athlete-state/freshness-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sharpit/server/lib/athlete-state/freshness-service')>()),
  trainingDayIdNow: vi.fn().mockReturnValue('2026-10-02'),
}));

vi.mock('@sharpit/server/infrastructure/athlete-state/snapshot-repository', () => ({
  getLatestAthleteSnapshot: vi.fn(),
}));

describe('morning-push', () => {
  const dummySnapshot = {
    athleteId: 'ath-1',
    trainingDayId: '2026-09-24',
    snapshotId: 'snap-1',
    todaysDecision: 'TRAIN_HARD',
    decision: { overallVerdict: 'TRAIN_HARD' },
    primaryProductMessage: 'Super forme ce matin — séance clé au programme.',
    briefing: null,
    insufficientDataMessage: null,
  } as unknown as AthleteSnapshot;

  describe('buildMorningPushPayload', () => {
    it('maps TRAIN_HARD verdict to French label and builds deep link', () => {
      const payload = buildMorningPushPayload(dummySnapshot, 'https://sharpit.app');
      expect(payload.title).toBe('Entraîne-toi fort');
      expect(payload.body).toBe('Super forme ce matin — séance clé au programme.');
      expect(payload.url).toBe('https://sharpit.app/today');
      expect(payload.verdict).toBe('TRAIN_HARD');
      expect(payload.trainingDayId).toBe('2026-09-24');
    });

    it('maps RECOVER verdict correctly', () => {
      const recoverSnap = {
        ...dummySnapshot,
        todaysDecision: 'RECOVER',
        primaryProductMessage: 'Sommeil perturbé — repos recommandé.',
      } as unknown as AthleteSnapshot;

      const payload = buildMorningPushPayload(recoverSnap, 'https://sharpit.app');
      expect(payload.title).toBe('Récupère');
      expect(payload.body).toBe('Sommeil perturbé — repos recommandé.');
    });

    it('truncates body exceeding 140 chars gracefully', () => {
      const longMessage = 'A'.repeat(200);
      const longSnap = {
        ...dummySnapshot,
        primaryProductMessage: longMessage,
      } as unknown as AthleteSnapshot;

      const payload = buildMorningPushPayload(longSnap);
      expect(payload.body.length).toBeLessThanOrEqual(140);
      expect(payload.body.endsWith('…')).toBe(true);
    });
  });

  describe('toApnsPayload', () => {
    it('creates an Apple APNs compliant alert payload', () => {
      const morning = buildMorningPushPayload(dummySnapshot, 'https://sharpit.app');
      const apns = toApnsPayload(morning);

      expect(apns.aps.alert?.title).toBe('Entraîne-toi fort');
      expect(apns.aps.sound).toBe('default');
      expect(apns.aps.badge).toBe(1);
      expect(apns.aps.category).toBe('MORNING_VERDICT');
      expect(apns.url).toBe('https://sharpit.app/today');
      expect(apns.trainingDayId).toBe('2026-09-24');
    });
  });

  describe('sendMorningPushForAthlete', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('skips when athlete already received morning push today (silence over noise)', async () => {
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValueOnce({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: '2026-09-24',
        deviceTokens: [{ id: 'dev-1', token: 'token123', bundleId: 'app.sharpit.ios' }],
      } as never);

      const result = await sendMorningPushForAthlete('ath-1', {
        trainingDayId: '2026-09-24',
      });

      expect(result.skippedReason).toBe('ALREADY_SENT_TODAY');
      expect(result.sent).toBe(0);
    });

    it('sends when force is true even if already sent today', async () => {
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValueOnce({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: '2026-09-24',
        deviceTokens: [
          { id: 'dev-1', token: 'token123', bundleId: 'app.sharpit.ios', environment: 'sandbox' },
        ],
      } as never);

      vi.mocked(snapshotRepo.getLatestAthleteSnapshot).mockResolvedValueOnce(dummySnapshot);
      const send = vi.spyOn(apnsModule, 'sendApnsNotification').mockResolvedValueOnce({
        success: true,
        status: 200,
        deviceToken: 'token123',
      });
      vi.spyOn(apnsModule, 'apnsConfigFor').mockImplementation(
        (environment) => ({ production: environment !== 'sandbox' }) as never,
      );
      vi.mocked(prisma.athleteProfile.update).mockResolvedValueOnce({} as never);

      const result = await sendMorningPushForAthlete('ath-1', {
        trainingDayId: '2026-09-24',
        force: true,
      });

      expect(result.sent).toBe(1);
      expect(result.skippedReason).toBeUndefined();
      // An Xcode build's token goes to the APNs sandbox, not production.
      expect(send.mock.calls[0]?.[0].config).toMatchObject({ production: false });
      // force skips the atomic claim; a successful test push still stamps the day.
      expect(prisma.athleteProfile.updateMany).not.toHaveBeenCalled();
      expect(prisma.athleteProfile.update).toHaveBeenCalledWith({
        where: { id: 'ath-1' },
        data: { lastMorningPushDate: '2026-09-24' },
      });
    });

    it('claims the day before sending so after()+cron cannot double-deliver', async () => {
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValueOnce({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: null,
        deviceTokens: [
          { id: 'dev-1', token: 'token123', bundleId: 'app.sharpit.ios', environment: 'sandbox' },
        ],
      } as never);
      vi.mocked(prisma.athleteProfile.updateMany).mockResolvedValueOnce({ count: 1 } as never);
      vi.mocked(snapshotRepo.getLatestAthleteSnapshot).mockResolvedValueOnce(dummySnapshot);
      vi.spyOn(apnsModule, 'sendApnsNotification').mockResolvedValueOnce({
        success: true,
        status: 200,
        deviceToken: 'token123',
      });
      vi.spyOn(apnsModule, 'apnsConfigFor').mockImplementation(
        (environment) => ({ production: environment !== 'sandbox' }) as never,
      );

      const result = await sendMorningPushForAthlete('ath-1', { trainingDayId: '2026-09-24' });

      expect(result.sent).toBe(1);
      expect(prisma.athleteProfile.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ath-1',
          deletedAt: null,
          NOT: { lastMorningPushDate: '2026-09-24' },
        },
        data: { lastMorningPushDate: '2026-09-24' },
      });
    });

    it('skips when the day was already claimed by a concurrent sender', async () => {
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValueOnce({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: null,
        deviceTokens: [{ id: 'dev-1', token: 'token123', bundleId: 'app.sharpit.ios' }],
      } as never);
      vi.mocked(prisma.athleteProfile.updateMany).mockResolvedValueOnce({ count: 0 } as never);

      const result = await sendMorningPushForAthlete('ath-1', { trainingDayId: '2026-09-24' });

      expect(result.skippedReason).toBe('ALREADY_SENT_TODAY');
      expect(snapshotRepo.getLatestAthleteSnapshot).not.toHaveBeenCalled();
    });

    it('skips an athlete who turned the morning verdict off', async () => {
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValueOnce({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: null,
        notificationPrefs: { version: 1, morningVerdict: false },
        deviceTokens: [{ id: 'dev-1', token: 'token123', bundleId: 'app.sharpit.ios' }],
      } as never);

      const result = await sendMorningPushForAthlete('ath-1', { trainingDayId: '2026-09-24' });

      expect(result.skippedReason).toBe('OPTED_OUT');
      expect(result.sent).toBe(0);
    });

    it('skips when athlete has no active device tokens', async () => {
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValueOnce({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: null,
        deviceTokens: [],
      } as never);

      const result = await sendMorningPushForAthlete('ath-1', {
        trainingDayId: '2026-09-24',
      });

      expect(result.skippedReason).toBe('NO_DEVICE_TOKENS');
      expect(result.sent).toBe(0);
    });

    it('deactivates device token when APNs reports 410 Unregistered', async () => {
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValueOnce({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: null,
        deviceTokens: [{ id: 'dev-1', token: 'dead-token', bundleId: 'app.sharpit.ios' }],
      } as never);

      vi.mocked(snapshotRepo.getLatestAthleteSnapshot).mockResolvedValueOnce(dummySnapshot);
      vi.spyOn(apnsModule, 'sendApnsNotification').mockResolvedValueOnce({
        success: false,
        status: 410,
        reason: 'Unregistered',
        deviceToken: 'dead-token',
      });

      const result = await sendMorningPushForAthlete('ath-1', {
        trainingDayId: '2026-09-24',
      });

      expect(result.failed).toBe(1);
      expect(result.deactivated).toBe(1);
      expect(prisma.deviceToken.update).toHaveBeenCalledWith({
        where: { token: 'dead-token' },
        data: { enabled: false },
      });
    });
  });

  describe('sendMorningVerdictPushes', () => {
    it('dispatches pushes to eligible athletes only', async () => {
      vi.mocked(prisma.athleteProfile.findMany).mockResolvedValueOnce([
        { id: 'ath-1' },
        { id: 'ath-2' },
      ] as never);

      vi.mocked(prisma.athleteProfile.findUnique)
        .mockResolvedValueOnce({
          id: 'ath-1',
          deletedAt: null,
          lastMorningPushDate: null,
          deviceTokens: [{ id: 'dev-1', token: 'token-1', bundleId: 'app.sharpit.ios' }],
        } as never)
        .mockResolvedValueOnce({
          id: 'ath-2',
          deletedAt: null,
          lastMorningPushDate: null,
          deviceTokens: [{ id: 'dev-2', token: 'token-2', bundleId: 'app.sharpit.ios' }],
        } as never);

      vi.mocked(snapshotRepo.getLatestAthleteSnapshot).mockResolvedValue(dummySnapshot);
      vi.spyOn(apnsModule, 'sendApnsNotification').mockResolvedValue({
        success: true,
        status: 200,
        deviceToken: 'token',
      });
      vi.mocked(prisma.athleteProfile.updateMany).mockResolvedValue({ count: 1 } as never);

      const summary = await sendMorningVerdictPushes({ trainingDayId: '2026-09-24' });

      expect(summary.totalAthletes).toBe(2);
      expect(summary.sentCount).toBe(2);
      expect(summary.failedCount).toBe(0);
    });
  });

  describe('the night’s proposal', () => {
    const proposal = {
      decisionId: 'd1',
      sessionId: 's1',
      sessionType: 'SWIM',
      direction: 'DOWN' as const,
      changeSummary: 'Endurance → Récupération · 40 → 30 min',
      why: 'RECOVER',
      status: 'PRESENTED' as const,
      fromIntensity: 'ENDURANCE',
      toIntensity: 'RECOVERY',
      fromDurationMin: 40,
      toDurationMin: 30,
      fromLoad: 30,
      toLoad: 21,
      fromDescription: null,
      toDescription: null,
    };

    it('leads the morning push with the proposal while it waits', () => {
      const payload = buildMorningPushPayload(dummySnapshot, 'https://sharpit.app', proposal);
      expect(payload.body).toBe(
        'Ta nuit invite à lever le pied : Endurance → Récupération · 40 → 30 min',
      );
    });

    it('says nothing of a proposal already answered', () => {
      expect(morningProposalLine({ ...proposal, status: 'ACCEPTED' })).toBeNull();
      expect(morningProposalLine(null)).toBeNull();
    });
  });

  describe('sendMorningPushOnceNightIsRead', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-02T08:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('waits for the morning: a night still being written is not a night', async () => {
      vi.setSystemTime(new Date('2026-10-02T03:00:00'));
      vi.mocked(prisma.dailyHealth.findUnique).mockResolvedValue({ sleepMinutes: 200 } as never);
      expect(await sendMorningPushOnceNightIsRead('ath-1')).toBeNull();
      expect(prisma.dailyHealth.findUnique).not.toHaveBeenCalled();
    });

    it('waits for last night’s sleep', async () => {
      vi.mocked(prisma.dailyHealth.findUnique).mockResolvedValue({ sleepMinutes: null } as never);
      expect(await sendMorningPushOnceNightIsRead('ath-1')).toBeNull();
      expect(prisma.athleteProfile.findUnique).not.toHaveBeenCalled();
    });

    it('never sends for a day back-filled later', async () => {
      expect(await sendMorningPushOnceNightIsRead('ath-1', '2026-09-20')).toBeNull();
      expect(prisma.dailyHealth.findUnique).not.toHaveBeenCalled();
    });

    it('goes through the once-a-day send once the night is in', async () => {
      vi.mocked(prisma.dailyHealth.findUnique).mockResolvedValue({ sleepMinutes: 420 } as never);
      vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValue({
        id: 'ath-1',
        deletedAt: null,
        lastMorningPushDate: '2026-10-02',
        notificationPrefs: null,
        deviceTokens: [{ id: 't1', token: 'x', bundleId: 'b', environment: 'production' }],
      } as never);

      const result = await sendMorningPushOnceNightIsRead('ath-1');

      expect(result?.skippedReason).toBe('ALREADY_SENT_TODAY');
    });
  });
});
