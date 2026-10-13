/**
 * Read-only: replays the race finish projection against a race already run.
 * Prints, leg by leg, the real race, the old iOS model (GoalAnalyticsEngine.computeTriathlonFinish)
 * and the server model v2 (buildRaceProjection) fed only with evidence from before race day.
 * Then replays v2 as of 8, 4 and 0 weeks before the race: today's level vs the race-day projection.
 * « norm » scores model pace over the real leg distances (courses are rarely exact).
 * Usage: yarn tsx scripts/backtest-race-projection.ts --athlete <id> [--goal <goalId>]
 */
import { ActivityType, GoalKind } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { isMultisportLegArray, type MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import {
  buildRaceProjection,
  projectionAsOf,
  type RaceProjection,
} from '@sharpit/app/lib/goals/goal-race-projection';
import { CAPACITY_WINDOW_DAYS } from '@sharpit/app/lib/goals/goal-race-capacity';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';
import { loadRaceProjectionEvidence } from '@sharpit/server/lib/goals/race-projection';

// Half-distance only: the race being audited. shortcut: other formats need their distances here.
const HALF = { swimM: 1900, bikeM: 90_000, runM: 21_097 };
const RECENT_DAYS = 84;

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return '—';
  }
  const sign = seconds < 0 ? '-' : '';
  const s = Math.round(Math.abs(seconds));
  return `${sign}${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function percentile(values: number[], share: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

type Legs = { swim: number; t1: number; bike: number; t2: number; run: number };

function total(legs: Legs): number {
  return legs.swim + legs.t1 + legs.bike + legs.t2 + legs.run;
}

type SportLeg = 'swim' | 'bike' | 'run';
const FORMAT_METERS: Record<SportLeg, number> = {
  swim: HALF.swimM,
  bike: HALF.bikeM,
  run: HALF.runM,
};

function actualMeters(legs: MultisportLeg[], kind: SportLeg): number {
  return legs
    .filter((leg) => leg.kind === kind)
    .reduce((sum, leg) => sum + (leg.distanceM ?? 0), 0);
}

/** Model legs rescaled to the real distances (unchanged where a distance is unknown). */
function normalised(model: Legs, legs: MultisportLeg[]): Legs {
  const scale = (kind: SportLeg) => {
    const meters = actualMeters(legs, kind);
    return meters > 0 ? (model[kind] * meters) / FORMAT_METERS[kind] : model[kind];
  };
  return { ...model, swim: scale('swim'), bike: scale('bike'), run: scale('run') };
}

function actualLegs(legs: MultisportLeg[]): Legs {
  const sport = (kind: MultisportLeg['kind']) =>
    legs.filter((leg) => leg.kind === kind).reduce((sum, leg) => sum + leg.durationSec, 0);
  const transition = (index: number) =>
    legs.find((leg) => leg.kind === 'transition' && leg.transitionIndex === index)?.durationSec ??
    0;
  return {
    swim: sport('swim'),
    t1: transition(1),
    bike: sport('bike'),
    t2: transition(2),
    run: sport('run'),
  };
}

/** Port of the iOS model, so its projection can be decomposed here. */
function iosModel(css: number | null, threshold: number | null, bikeSpeedMs: number | null): Legs {
  const swim = (HALF.swimM / 100) * (css ?? 103.5) * 1.07;
  const bike = HALF.bikeM / (bikeSpeedMs ?? 8.91);
  const run = (HALF.runM / 1000) * (threshold ?? 306) * 1.08;
  return { swim, t1: 126, bike, t2: 79, run };
}

function modelLegs(projection: RaceProjection | null): Legs | null {
  if (!projection) {
    return null;
  }
  const sec = (kind: keyof Legs) => projection.legs.find((leg) => leg.kind === kind)?.sec ?? 0;
  return { swim: sec('swim'), t1: sec('t1'), bike: sec('bike'), t2: sec('t2'), run: sec('run') };
}

async function main(): Promise<void> {
  const athleteId = argValue('--athlete');
  if (!athleteId) {
    throw new Error('Usage: --athlete <id> [--goal <goalId>]');
  }
  const goalId = argValue('--goal');

  const goal = await prisma.goal.findFirst({
    where: {
      athleteId,
      kind: GoalKind.RACE,
      ...(goalId ? { id: goalId } : { activities: { some: visibleActivityWhere } }),
    },
    orderBy: { targetDate: 'desc' },
    include: {
      activities: {
        where: visibleActivityWhere,
        select: { id: true, date: true, duration: true, multisportLegs: true },
      },
    },
  });
  const race = goal?.activities.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
  if (!goal || !race || !isMultisportLegArray(race.multisportLegs)) {
    throw new Error('No race goal with a linked triathlon (multisport legs) found.');
  }

  const [thresholds, weighIn] = await Promise.all([
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: { swimCssSecPer100m: true, runThresholdPaceSecPerKm: true, ftpW: true },
    }),
    prisma.bodyCompositionMeasurement.findFirst({
      where: { athleteId, measuredAt: { lte: race.date }, weightKg: { not: null } },
      orderBy: { measuredAt: 'desc' },
      select: { weightKg: true },
    }),
  ]);
  const profile = thresholds && { ...thresholds, weightKg: weighIn?.weightKg ?? null };
  const rides = await prisma.activity.findMany({
    where: { athleteId, type: ActivityType.BIKE, date: { lt: race.date }, ...visibleActivityWhere },
    select: { date: true, duration: true, bikeMetrics: { select: { distanceM: true } } },
  });
  const speeds = (since: Date | null) =>
    rides
      .filter((ride) => !since || ride.date >= since)
      .flatMap((ride) => {
        const distance = ride.bikeMetrics?.distanceM ?? 0;
        const speed = ride.duration ? distance / ride.duration : 0;
        return distance >= HALF.bikeM * 0.35 && speed > 4 && speed < 18 ? [speed] : [];
      });
  const allSpeeds = speeds(null);
  const recentSpeeds = speeds(new Date(race.date.getTime() - RECENT_DAYS * 86_400_000));

  const css = profile?.swimCssSecPer100m ?? null;
  const threshold = profile?.runThresholdPaceSecPerKm ?? null;
  const actual = actualLegs(race.multisportLegs);
  const ios = iosModel(css, threshold, percentile(allSpeeds, 0.5));
  const asOf = projectionAsOf(goal.targetDate ?? race.date, new Date());
  const evidence = await loadRaceProjectionEvidence(
    athleteId,
    // Room for the replay 8 weeks back.
    new Date(asOf.getTime() - (CAPACITY_WINDOW_DAYS + 56) * 86_400_000),
  );
  const raceDayProfile = {
    ...evidence.profile,
    weightKg: profile?.weightKg ?? evidence.profile.weightKg,
  };
  const projection = buildRaceProjection(goal, { ...evidence, asOf, profile: raceDayProfile });
  const v2 = modelLegs(projection);
  const raceLegs = race.multisportLegs;
  const v2Norm = v2 && normalised(v2, raceLegs);
  const kmh = (speed: number | null) => (speed === null ? '—' : `${(speed * 3.6).toFixed(1)} km/h`);

  console.log(
    `Goal: ${goal.title} (${goal.raceFormat ?? 'no format'}) · target ${goal.targetPerformance ?? '—'}`,
  );
  console.log(
    `Profile: CSS ${css ?? 'unset (model uses 103.5)'} s/100m · run threshold ${threshold ?? 'unset (model uses 306)'} s/km · FTP ${profile?.ftpW ?? 'unset'} W · weight ${profile?.weightKg ?? 'unset'} kg`,
  );
  console.log(
    `Rides ≥ ${(HALF.bikeM * 0.35) / 1000} km before the race: ${allSpeeds.length} (median ${kmh(percentile(allSpeeds, 0.5))}) · last ${RECENT_DAYS} d: ${recentSpeeds.length} (p75 ${kmh(percentile(recentSpeeds, 0.75))})`,
  );
  const legNames = ['swim', 't1', 'bike', 't2', 'run'] as const;
  const rows = legNames.map((leg) => ({
    leg: leg as string,
    actual: clock(actual[leg]),
    iosModel: clock(ios[leg]),
    iosError: clock(ios[leg] - actual[leg]),
    v2: clock(v2?.[leg] ?? null),
    v2Error: clock(v2 ? v2[leg] - actual[leg] : null),
    v2Norm: clock(v2Norm?.[leg] ?? null),
    v2NormError: clock(v2Norm ? v2Norm[leg] - actual[leg] : null),
    v2Source: projection?.legs.find((entry) => entry.kind === leg)?.source ?? '—',
    v2Method: projection?.legs.find((entry) => entry.kind === leg)?.method ?? '—',
  }));
  rows.push({
    leg: 'total',
    actual: clock(total(actual)),
    iosModel: clock(total(ios)),
    iosError: clock(total(ios) - total(actual)),
    v2: clock(v2 && total(v2)),
    v2Error: clock(v2 ? total(v2) - total(actual) : null),
    v2Norm: clock(v2Norm && total(v2Norm)),
    v2NormError: clock(v2Norm ? total(v2Norm) - total(actual) : null),
    v2Source: projection?.confidence ?? '—',
    v2Method: '—',
  });
  console.log(
    `Real distances: swim ${actualMeters(raceLegs, 'swim')} m · bike ${actualMeters(raceLegs, 'bike')} m · run ${actualMeters(raceLegs, 'run')} m · profile LTHR ${evidence.profile.lthr ?? 'unset'} · max HR ${evidence.profile.maxHr ?? 'unset'}`,
  );
  console.table(rows);
  console.log(
    `v2 as of ${asOf.toISOString()}: ${clock(projection?.finishSec ?? null)} (${clock(projection?.lowSec ?? null)}–${clock(projection?.highSec ?? null)}) · ${projection?.confidence ?? 'no projection'}`,
  );
  if (projection?.missing.length) {
    console.log(`Missing: ${projection.missing.join(' · ')}`);
  }

  const raceStart = asOf.getTime();
  console.table(
    [8, 4, 0].map((weeksBefore) => {
      const at = new Date(raceStart - weeksBefore * 7 * 86_400_000);
      const replay = buildRaceProjection(goal, { ...evidence, profile: raceDayProfile, asOf: at });
      const replayLegs = modelLegs(replay);
      const replayNorm = replayLegs && normalised(replayLegs, raceLegs);
      return {
        asOf: at.toISOString().slice(0, 10),
        today: clock(replay?.todaySec ?? null),
        raceDay: clock(replay?.finishSec ?? null),
        raceDayError: clock(replay ? replay.finishSec - total(actual) : null),
        // Race-day legs over the real distances.
        raceDayNormError: clock(replayNorm ? total(replayNorm) - total(actual) : null),
        secPerWeek: replay?.trend.secPerWeek ?? '—',
        regularity: replay?.regularity ?? '—',
      };
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
