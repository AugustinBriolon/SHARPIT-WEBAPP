import { ActivityType, type PrismaClient } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import type { ExtractionContext } from '@sharpit/core/features/context';
import type { SessionStreamProvider } from '@sharpit/core/features/engine';
import type { SessionObservation } from '@sharpit/core/observation/types';
import {
  analyzeActivityStreams,
  resolveThresholds,
  type AthleteThresholds,
} from '@sharpit/app/lib/activity/detail/activity-analysis';
import type { RawStreams } from '@sharpit/server/lib/streams/streams';

const SPORT_TO_ACTIVITY_TYPE: Partial<Record<SessionObservation['sportType'], ActivityType>> = {
  RUN: ActivityType.RUN,
  TRAIL_RUN: ActivityType.RUN,
  BIKE: ActivityType.BIKE,
  MTB: ActivityType.BIKE,
  SWIM: ActivityType.SWIM,
  OPEN_WATER: ActivityType.SWIM,
  STRENGTH: ActivityType.STRENGTH,
  YOGA: ActivityType.STRENGTH,
  TRIATHLON: ActivityType.TRIATHLON,
};

function toActivityType(sportType: SessionObservation['sportType']): ActivityType {
  return SPORT_TO_ACTIVITY_TYPE[sportType] ?? ActivityType.OTHER;
}

function profileThresholdInput(ctx: ExtractionContext) {
  return {
    ftpW: ctx.ftpW ?? null,
    maxHr: ctx.maxHr ?? null,
    lthr: ctx.lthr ?? null,
    runThresholdPaceSecPerKm: ctx.runThresholdPaceSecPerKm ?? null,
  };
}

function sessionAnalysisContext(session: SessionObservation) {
  return {
    type: toActivityType(session.sportType),
    durationSec: session.durationSec,
    bikeNormalizedPower: session.powerData?.normalizedPower ?? null,
    bikeIntensityFactor: session.powerData?.intensityFactor ?? null,
  };
}

function buildThresholds(
  ctx: ExtractionContext,
  raw: RawStreams,
  session: SessionObservation,
): AthleteThresholds {
  return resolveThresholds(profileThresholdInput(ctx), raw, sessionAnalysisContext(session));
}

function findSessionWhere(session: SessionObservation) {
  if (session.source === 'GARMIN' && session.externalId) {
    return { garminId: session.externalId };
  }
  if (session.source === 'STRAVA' && session.externalId) {
    return { stravaId: session.externalId };
  }
  if (session.source === 'MANUAL' && session.externalId?.startsWith('manual:activity:')) {
    return { id: session.externalId.replace('manual:activity:', '') };
  }
  return null;
}

function mapZonesToFiveBuckets(
  zones: Array<{ id: string; seconds: number }>,
): readonly [number, number, number, number, number] | null {
  if (zones.length === 0) {
    return null;
  }

  const buckets = [0, 0, 0, 0, 0];
  for (const zone of zones) {
    switch (zone.id) {
      case 'z1':
        buckets[0] += zone.seconds / 60;
        break;
      case 'z2':
        buckets[1] += zone.seconds / 60;
        break;
      case 'z3':
        buckets[2] += zone.seconds / 60;
        break;
      case 'z4':
        buckets[3] += zone.seconds / 60;
        break;
      default:
        buckets[4] += zone.seconds / 60;
        break;
    }
  }

  return buckets.map((v) => Number(v.toFixed(1))) as [number, number, number, number, number];
}

function computeLoadFactors(
  timeInZones: readonly [number, number, number, number, number] | null,
  durationSec: number,
): { aerobicLoadFactor: number | null; anaerobicLoadFactor: number | null } {
  if (timeInZones === undefined || timeInZones === null) {
    return { aerobicLoadFactor: null, anaerobicLoadFactor: null };
  }

  const durationMin = Math.max(durationSec / 60, 1);
  return {
    aerobicLoadFactor: Number(((timeInZones[0] + timeInZones[1]) / durationMin || 0).toFixed(3)),
    anaerobicLoadFactor: Number(((timeInZones[3] + timeInZones[4]) / durationMin || 0).toFixed(3)),
  };
}

function buildStreamResult(
  analysis: NonNullable<ReturnType<typeof analyzeActivityStreams>>,
  session: SessionObservation,
) {
  const zones = analysis.hr.zones.length > 0 ? analysis.hr.zones : (analysis.power?.zones ?? []);
  const timeInZones = mapZonesToFiveBuckets(zones);
  const { aerobicLoadFactor, anaerobicLoadFactor } = computeLoadFactors(
    timeInZones,
    session.durationSec,
  );

  return {
    aerobicLoadFactor,
    anaerobicLoadFactor,
    timeInZones,
    hrDriftPercent: analysis.hr.decouplingPct,
    paceVariabilityIndex: isSet(analysis.run?.paceVariabilityPct)
      ? Number((analysis.run.paceVariabilityPct / 100).toFixed(3))
      : null,
  };
}

function analyzeSessionStream(
  activity: {
    type: ActivityType;
    duration: number;
    stream: { available: boolean; data: unknown };
  },
  session: SessionObservation,
  ctx: ExtractionContext,
  raw: RawStreams,
) {
  const thresholds = buildThresholds(ctx, raw, session);
  return analyzeActivityStreams(raw, thresholds, {
    type: activity.type,
    durationSec: activity.duration,
    bikeNormalizedPower: session.powerData?.normalizedPower ?? null,
    bikeIntensityFactor: session.powerData?.intensityFactor ?? null,
  });
}

export class PrismaSessionStreamProvider implements SessionStreamProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async getSessionStream(session: SessionObservation, ctx: ExtractionContext) {
    const where = findSessionWhere(session);
    if (!where) {
      return null;
    }

    // Provider ids are unique per athlete, not across athletes: scope the match.
    const activity = await this.prisma.activity.findFirst({
      where: { ...where, athleteId: ctx.athleteId },
      select: {
        id: true,
        type: true,
        duration: true,
        stream: { select: { available: true, data: true } },
      },
    });

    if (!activity?.stream?.available || !activity.stream.data) {
      return null;
    }

    const { duration, type, stream } = activity;
    if (duration === null) {
      return null;
    }

    const raw = stream.data as unknown as RawStreams;
    const analysis = analyzeSessionStream({ type, duration, stream }, session, ctx, raw);
    if (!analysis) {
      return null;
    }

    return buildStreamResult(analysis, session);
  }
}
