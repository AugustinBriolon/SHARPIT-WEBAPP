/**
 * EXTRACTION CONTEXT PROVIDER — Prisma implementation
 *
 * Resolves athlete capabilities (FTP, maxHr, etc.) from the AthleteProfile
 * and recent physiological observations into an ExtractionContext.
 *
 * This adapter prevents the FeatureEngine from importing Prisma directly.
 * The FeatureEngine depends only on the ExtractionContextProvider interface.
 */

import type { PrismaClient } from '@prisma/client';

import type { ExtractionContextProvider } from '@sharpit/core/features/engine';
import { typicalLoadPerHour, type ExtractionContext } from '@sharpit/core/features/context';

/** How far back measured sessions set the athlete's usual load per hour. */
const TYPICAL_LOAD_WINDOW_DAYS = 180;

function optionalProfileField<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function buildExtractionContextFields(input: {
  athleteId: string;
  trainingDayId: string;
  timezone: string;
  profile: Awaited<ReturnType<AthleteContextProvider['fetchProfile']>>;
  restingHr: number | undefined;
  typicalLoad: ExtractionContext['typicalLoadPerHour'];
}): ExtractionContext {
  const { athleteId, trainingDayId, timezone, profile, restingHr, typicalLoad } = input;
  return {
    athleteId,
    trainingDayId,
    timezone,
    ftpW: optionalProfileField(profile?.ftpW),
    maxHr: optionalProfileField(profile?.maxHr),
    restingHr,
    lthr: optionalProfileField(profile?.lthr),
    runThresholdPaceSecPerKm: optionalProfileField(profile?.runThresholdPaceSecPerKm),
    sleepTargetMinutes: optionalProfileField(profile?.sleepTargetMinutes),
    typicalLoadPerHour: typicalLoad,
  };
}

export class AthleteContextProvider implements ExtractionContextProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async getContext(athleteId: string, trainingDayId: string): Promise<ExtractionContext> {
    const [profile, restingHr, timezone, typicalLoad] = await Promise.all([
      this.fetchProfile(athleteId),
      this.fetchRestingHr(athleteId, trainingDayId),
      this.fetchTimezone(athleteId),
      this.fetchTypicalLoad(athleteId, trainingDayId),
    ]);

    return buildExtractionContextFields({
      athleteId,
      trainingDayId,
      timezone,
      profile,
      restingHr,
      typicalLoad,
    });
  }

  private fetchProfile(athleteId: string) {
    return this.prisma.athleteProfile.findUnique({ where: { id: athleteId } });
  }

  /**
   * The resting pulse as of the day extracted, else the earliest one known. Read as the
   * latest whatever the day, an old session recomputed today was scored on today's pulse.
   */
  private async fetchRestingHr(
    athleteId: string,
    trainingDayId: string,
  ): Promise<number | undefined> {
    const asOf = await this.restingHrObservation(athleteId, {
      where: { trainingDayId: { lte: trainingDayId } },
      order: 'desc',
    });
    return asOf ?? this.restingHrObservation(athleteId, { where: {}, order: 'asc' });
  }

  private async restingHrObservation(
    athleteId: string,
    query: { where: { trainingDayId?: { lte: string } }; order: 'asc' | 'desc' },
  ): Promise<number | undefined> {
    const recentRhrObs = await this.prisma.observation.findFirst({
      where: { athleteId, type: 'RESTING_HR', ...query.where },
      orderBy: { timestamp: query.order },
      select: { data: true },
    });
    return recentRhrObs?.data ? (recentRhrObs.data as { valueBpm?: number }).valueBpm : undefined;
  }

  /** The athlete's measured load per hour by sport over the six months before the day. */
  private async fetchTypicalLoad(
    athleteId: string,
    trainingDayId: string,
  ): Promise<ExtractionContext['typicalLoadPerHour']> {
    const since = new Date(`${trainingDayId}T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - TYPICAL_LOAD_WINDOW_DAYS);
    const rows = await this.prisma.featureSet.findMany({
      where: {
        athleteId,
        category: 'SESSION',
        trainingDayId: { gte: since.toISOString().slice(0, 10), lt: trainingDayId },
      },
      orderBy: { version: 'desc' },
      distinct: ['sessionObsId'],
      select: { data: true },
    });
    return typicalLoadPerHour(
      rows.flatMap((row) => {
        const data = row.data as Partial<Parameters<typeof typicalLoadPerHour>[0][number]> | null;
        return data?.sportType &&
          typeof data.durationSec === 'number' &&
          typeof data.tssScore === 'number' &&
          data.tssMethod
          ? [data as Parameters<typeof typicalLoadPerHour>[0][number]]
          : [];
      }),
    );
  }

  private async fetchTimezone(athleteId: string): Promise<string> {
    const googleAccount = await this.prisma.googleAccount.findFirst({
      where: { athleteId },
      select: { timeZone: true },
    });
    return googleAccount?.timeZone ?? 'Europe/Paris';
  }
}
