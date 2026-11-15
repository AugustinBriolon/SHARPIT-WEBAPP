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
  thresholds: readonly ThresholdSnapshot[];
  restingHr: number | undefined;
  typicalLoad: ExtractionContext['typicalLoadPerHour'];
}): ExtractionContext {
  const { athleteId, trainingDayId, timezone, profile, restingHr, typicalLoad } = input;
  const asOf = (field: ThresholdField) =>
    thresholdAsOf(input.thresholds, trainingDayId, field) ?? optionalProfileField(profile?.[field]);
  return {
    athleteId,
    trainingDayId,
    timezone,
    ftpW: asOf('ftpW'),
    maxHr: optionalProfileField(profile?.maxHr),
    restingHr,
    lthr: asOf('lthr'),
    runThresholdPaceSecPerKm: asOf('runThresholdPaceSecPerKm'),
    sleepTargetMinutes: optionalProfileField(profile?.sleepTargetMinutes),
    typicalLoadPerHour: typicalLoad,
  };
}

type ThresholdField = 'ftpW' | 'lthr' | 'runThresholdPaceSecPerKm';
type ThresholdSnapshot = { createdAt: Date } & Partial<Record<ThresholdField, number | null>>;

/**
 * A threshold as it stood on the day extracted: the last value recorded by then, else the
 * first one ever recorded. Read from the profile, a recomputation scored a ride of August
 * on November's FTP and moved the whole history by the square of their ratio.
 * Undefined when the history never held the value.
 */
export function thresholdAsOf(
  snapshots: readonly ThresholdSnapshot[],
  trainingDayId: string,
  field: ThresholdField,
): number | undefined {
  const endOfDay = new Date(`${trainingDayId}T23:59:59.999Z`).getTime();
  const known = snapshots
    .filter((snapshot) => typeof snapshot[field] === 'number' && (snapshot[field] as number) > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const byThen = known.filter((snapshot) => snapshot.createdAt.getTime() <= endOfDay);
  const chosen = byThen[byThen.length - 1] ?? known[0];
  return chosen ? (chosen[field] as number) : undefined;
}

export class AthleteContextProvider implements ExtractionContextProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async getContext(athleteId: string, trainingDayId: string): Promise<ExtractionContext> {
    const [profile, thresholds, restingHr, timezone, typicalLoad] = await Promise.all([
      this.fetchProfile(athleteId),
      this.prisma.athleteThresholdSnapshot.findMany({
        where: { profileId: athleteId },
        select: { createdAt: true, ftpW: true, lthr: true, runThresholdPaceSecPerKm: true },
      }),
      this.fetchRestingHr(athleteId, trainingDayId),
      this.fetchTimezone(athleteId),
      this.fetchTypicalLoad(athleteId, trainingDayId),
    ]);

    return buildExtractionContextFields({
      athleteId,
      trainingDayId,
      timezone,
      profile,
      thresholds,
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
