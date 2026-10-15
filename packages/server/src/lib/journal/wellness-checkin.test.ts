import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/db/client', () => ({
  prisma: {
    observation: { findMany: vi.fn() },
    athleteProfile: { findUnique: vi.fn() },
  },
}));
vi.mock('@sharpit/server/lib/engines/observation-engine', () => ({
  observationEngine: { ingest: vi.fn() },
}));
vi.mock('@sharpit/server/lib/athlete-state/orchestrator', () => ({
  onWellnessSubmitted: vi.fn(),
}));
vi.mock('@sharpit/server/infrastructure/athlete-state/snapshot-repository', () => ({
  getLatestAthleteSnapshot: vi.fn(),
}));
vi.mock('@sharpit/server/lib/integrations/apple-calendar/athlete-calendar-time-zone', () => ({
  resolveAthleteCalendarTimeZone: vi.fn(),
}));
vi.mock('@sharpit/server/lib/morning-recalibration/service', () => ({
  refreshMorningRecalibrationAfterCheckIn: vi.fn(),
}));

import { prisma } from '@sharpit/db/client';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { onWellnessSubmitted } from '@sharpit/server/lib/athlete-state/orchestrator';
import { getLatestAthleteSnapshot } from '@sharpit/server/infrastructure/athlete-state/snapshot-repository';
import { resolveAthleteCalendarTimeZone } from '@sharpit/server/lib/integrations/apple-calendar/athlete-calendar-time-zone';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import {
  getWellnessCheckInStatus,
  hasMorningWellnessCheckin,
  submitMorningWellnessCheckin,
  todayTrainingDayIdForAthlete,
  verdictSummaryFromSnapshot,
} from './wellness-checkin';

const ATHLETE_A = 'athlete-a';
const ATHLETE_B = 'athlete-b';
const DAY = '2026-10-15';

function snapshotWithSubjectiveLimiter(): AthleteSnapshot {
  return {
    todaysDecision: 'TRAIN_EASY',
    decision: {
      overallVerdict: 'TRAIN_EASY',
      limitingFactor: {
        system: 'RECOVERY',
        description: {
          code: 'reasoning.limitingFactor.recovery.deficit',
          params: { limiter: 'subjective' },
        },
        actionable: true,
      },
    },
    limitingFactor: {
      system: 'RECOVERY',
      description: {
        code: 'reasoning.limitingFactor.recovery.deficit',
        params: { limiter: 'subjective' },
      },
      actionable: true,
    },
  } as unknown as AthleteSnapshot;
}

describe('wellness-checkin service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAthleteCalendarTimeZone).mockResolvedValue('America/New_York');
  });

  describe('todayTrainingDayIdForAthlete', () => {
    it('uses the athlete timezone (same source as the verdict day)', async () => {
      // 2026-10-15 03:30 UTC = still 2026-10-14 in America/New_York
      const instant = new Date('2026-10-15T03:30:00.000Z');
      await expect(todayTrainingDayIdForAthlete(ATHLETE_A, instant)).resolves.toBe('2026-10-14');
      expect(resolveAthleteCalendarTimeZone).toHaveBeenCalledWith(ATHLETE_A);
    });
  });

  describe('getWellnessCheckInStatus', () => {
    it('returns localDate + completed without loading entry content', async () => {
      vi.mocked(prisma.observation.findMany).mockResolvedValueOnce([
        { data: { mood: 2, energyLevel: 2, perceivedSoreness: 4, stressLevel: 3 } },
      ] as never);

      const status = await getWellnessCheckInStatus(
        ATHLETE_A,
        new Date('2026-10-15T16:00:00.000Z'),
      );

      expect(status).toEqual({ localDate: '2026-10-15', completed: true });
      expect(prisma.observation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            athleteId: ATHLETE_A,
            trainingDayId: '2026-10-15',
            type: 'SUBJECTIVE',
            source: 'MANUAL',
          }),
          select: { data: true },
        }),
      );
    });

    it('never queries another athlete when resolving status for A', async () => {
      vi.mocked(prisma.observation.findMany).mockResolvedValueOnce([]);

      await getWellnessCheckInStatus(ATHLETE_A, new Date('2026-10-15T16:00:00.000Z'));

      const where = vi.mocked(prisma.observation.findMany).mock.calls[0]![0]!.where!;
      expect(where.athleteId).toBe(ATHLETE_A);
      expect(where.athleteId).not.toBe(ATHLETE_B);
      expect(JSON.stringify(where)).not.toContain(ATHLETE_B);
    });
  });

  describe('hasMorningWellnessCheckin isolation', () => {
    it('athlete A cannot observe athlete B rows through the query filter', async () => {
      vi.mocked(prisma.observation.findMany)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([
          { data: { mood: 1, energyLevel: 1, perceivedSoreness: 9, stressLevel: 5 } },
        ] as never);

      await expect(hasMorningWellnessCheckin(ATHLETE_A, DAY)).resolves.toBe(false);
      await expect(hasMorningWellnessCheckin(ATHLETE_B, DAY)).resolves.toBe(true);

      const aWhere = vi.mocked(prisma.observation.findMany).mock.calls[0]![0]!.where!;
      expect(aWhere.athleteId).toBe(ATHLETE_A);
      expect(vi.mocked(prisma.observation.findMany).mock.calls[1]![0]!.where!.athleteId).toBe(
        ATHLETE_B,
      );
    });
  });

  describe('submitMorningWellnessCheckin', () => {
    const payload = {
      mood: 2,
      energyLevel: 2,
      perceivedSoreness: 6,
      stressLevel: 4,
      notes: null,
    };

    it('recomputes the verdict on first save and returns codes only', async () => {
      vi.mocked(prisma.observation.findMany).mockResolvedValueOnce([]);
      vi.mocked(observationEngine.ingest).mockResolvedValueOnce({
        status: 'ACCEPTED',
        observationId: 'obs-1',
      } as never);
      vi.mocked(onWellnessSubmitted).mockResolvedValueOnce(snapshotWithSubjectiveLimiter());

      const result = await submitMorningWellnessCheckin(ATHLETE_A, DAY, payload);

      expect(observationEngine.ingest).toHaveBeenCalledWith(
        ATHLETE_A,
        expect.objectContaining({ type: 'SUBJECTIVE', source: 'MANUAL', mood: 2 }),
        { timezone: 'America/New_York' },
      );
      expect(onWellnessSubmitted).toHaveBeenCalledWith(ATHLETE_A, DAY);
      expect(result).toEqual({
        alreadyCompleted: false,
        localDate: DAY,
        verdict: {
          overallVerdict: 'TRAIN_EASY',
          limitingFactorSystem: 'RECOVERY',
          limitingFactorCode: 'reasoning.limitingFactor.recovery.deficit',
          limiter: 'subjective',
        },
      });
      expect(JSON.stringify(result)).not.toContain('notes');
      expect(JSON.stringify(result)).not.toContain('perceivedSoreness');
    });

    it('is idempotent on double submit — no second ingest, returns cached verdict', async () => {
      vi.mocked(prisma.observation.findMany).mockResolvedValueOnce([
        { data: { mood: 2, energyLevel: 2, perceivedSoreness: 6, stressLevel: 4 } },
      ] as never);
      vi.mocked(getLatestAthleteSnapshot).mockResolvedValueOnce(snapshotWithSubjectiveLimiter());

      const result = await submitMorningWellnessCheckin(ATHLETE_A, DAY, payload);

      expect(observationEngine.ingest).not.toHaveBeenCalled();
      expect(onWellnessSubmitted).not.toHaveBeenCalled();
      expect(result.alreadyCompleted).toBe(true);
      expect(result.verdict?.limiter).toBe('subjective');
    });
  });

  describe('verdictSummaryFromSnapshot', () => {
    it('exposes limiter=subjective for the subjective_low card path', () => {
      const summary = verdictSummaryFromSnapshot(snapshotWithSubjectiveLimiter());
      expect(summary?.limiter).toBe('subjective');
      expect(summary?.overallVerdict).toBe('TRAIN_EASY');
    });

    it('returns null when there is no snapshot', () => {
      expect(verdictSummaryFromSnapshot(null)).toBeNull();
    });
  });
});
