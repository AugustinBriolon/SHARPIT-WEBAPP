import { describe, expect, it } from 'vitest';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import {
  buildRaceProjection,
  parseRaceTargetSeconds,
  projectionAsOf,
  projectionVerdict,
  structuredRaceFromText,
  resolveRunRaceMeters,
  shouldFreezeProjection,
  type RaceProjectionInputs,
} from '@sharpit/app/lib/goals/goal-race-projection';
describe('resolveRunRaceMeters', () => {
  it('maps common run formats', () => {
    expect(resolveRunRaceMeters('10 km', null)).toBe(10000);
    expect(resolveRunRaceMeters('Semi', null)).toBe(21097);
    expect(resolveRunRaceMeters('Marathon de Paris', null)).toBe(42195);
    expect(resolveRunRaceMeters(null, '5K Boulogne')).toBe(5000);
  });

  it('rejects multisport formats', () => {
    expect(resolveRunRaceMeters('Half Ironman', null)).toBeNull();
    expect(resolveRunRaceMeters('70.3', 'Versailles')).toBeNull();
    expect(resolveRunRaceMeters('Ironman', null)).toBeNull();
  });
});

describe('parseRaceTargetSeconds', () => {
  it('parses chrono and Sub/Sous hour forms', () => {
    expect(parseRaceTargetSeconds('1:30:00')).toBe(5400);
    expect(parseRaceTargetSeconds('Sub 1h30')).toBe(5400);
    expect(parseRaceTargetSeconds('Sous 6h')).toBe(21600);
    expect(parseRaceTargetSeconds('Sub 5h00')).toBe(18000);
    expect(parseRaceTargetSeconds('42:15')).toBe(2535);
    expect(parseRaceTargetSeconds('Sub 5h30')).toBe(19800);
    expect(parseRaceTargetSeconds('5:28:00')).toBe(19680);
    expect(parseRaceTargetSeconds("5h28'30")).toBe(19710);
    expect(parseRaceTargetSeconds('50 min')).toBe(3000);
    expect(parseRaceTargetSeconds('Terminer')).toBeNull();
  });
});

const RACE_DAY = new Date('2026-10-11T00:00:00Z');
const HALF = {
  raceFormat: 'HALF IRON MAN',
  title: 'Half IronMan Versailles',
  targetPerformance: 'Sub 6h',
};

function daysBefore(days: number): Date {
  return new Date(RACE_DAY.getTime() - days * 86_400_000);
}

function inputs(overrides: Partial<RaceProjectionInputs> = {}): RaceProjectionInputs {
  return {
    asOf: RACE_DAY,
    profile: {
      swimCssSecPer100m: null,
      runThresholdPaceSecPerKm: null,
      ftpW: null,
      weightKg: null,
      lthr: null,
      maxHr: null,
    },
    runEfforts: [],
    rides: [],
    pastRaces: [],
    plannedSessions: [],
    trainingVolume: [],
    ...overrides,
  };
}

function ride(daysAgo: number, km = 80, kmh = 27.2) {
  return { date: daysBefore(daysAgo), distanceM: km * 1000, durationSec: (km / kmh) * 3600 };
}

function leg(kind: MultisportLeg['kind'], durationSec: number, extra: Partial<MultisportLeg> = {}) {
  return {
    kind,
    label: kind,
    durationSec,
    movingDurationSec: null,
    distanceM: null,
    avgHr: null,
    avgSpeedMs: null,
    elevationM: null,
    calories: null,
    garminActivityId: null,
    transitionIndex: null,
    ...extra,
  } satisfies MultisportLeg;
}

function legOf(projection: ReturnType<typeof buildRaceProjection>, kind: string) {
  return projection?.legs.find((entry) => entry.kind === kind);
}

describe('buildRaceProjection — run leg', () => {
  it('Riegels the fastest recent reference, then applies the half brick factor', () => {
    const projection = buildRaceProjection(
      HALF,
      inputs({
        runEfforts: [
          { meters: 10_000, seconds: 2760, date: daysBefore(20) },
          { meters: 16_000, seconds: 5400, date: daysBefore(10) },
        ],
      }),
    );
    // 2760 × (21097/10000)^1.06 × 1.04, × 1.0036 for 20 days of age.
    expect(legOf(projection, 'run')).toEqual({
      kind: 'run',
      sec: 6356,
      source: 'recent',
      method: 'decayed-best',
    });
  });

  it('ignores efforts older than 26 weeks or after the cut-off', () => {
    const projection = buildRaceProjection(
      HALF,
      inputs({
        profile: {
          swimCssSecPer100m: null,
          runThresholdPaceSecPerKm: 334,
          ftpW: null,
          weightKg: null,
          lthr: null,
          maxHr: null,
        },
        runEfforts: [
          { meters: 10_000, seconds: 2400, date: daysBefore(200) },
          { meters: 21_100, seconds: 6000, date: RACE_DAY },
        ],
      }),
    );
    expect(legOf(projection, 'run')?.source).toBe('profile');
    expect(projection?.missing).toContain(
      'Pas de course à pied récente : allure seuil du profil utilisée',
    );
  });

  it('falls back to an amateur default and asks for the threshold', () => {
    const projection = buildRaceProjection(HALF, inputs());
    expect(legOf(projection, 'run')?.source).toBe('default');
    expect(projection?.missing.some((hint) => hint.includes('allure seuil'))).toBe(true);
  });

  it('projects a running race as a single Riegel leg, without brick factor', () => {
    const projection = buildRaceProjection(
      { raceFormat: '10 km', title: '10 km Boulogne', targetPerformance: 'Sub 45:00' },
      inputs({ runEfforts: [{ meters: 10_000, seconds: 2400, date: daysBefore(7) }] }),
    );
    expect(projection?.legs).toEqual([
      { kind: 'run', sec: 2403, source: 'recent', method: 'decayed-best' },
    ]);
    expect(projection).toMatchObject({ targetSec: 2700, deltaSec: -297, confidence: 'high' });
  });
});

describe('buildRaceProjection — swim leg', () => {
  const css = {
    swimCssSecPer100m: 108,
    runThresholdPaceSecPerKm: null,
    ftpW: null,
    weightKg: null,
    lthr: null,
    maxHr: null,
  };

  it('uses CSS × 0.98 open water over the format distance', () => {
    expect(legOf(buildRaceProjection(HALF, inputs({ profile: css })), 'swim')).toEqual({
      kind: 'swim',
      sec: 2011,
      source: 'profile',
    });
  });

  it('prefers the swim pace of a past race', () => {
    const pastRaces = [
      { date: daysBefore(365), multisportLegs: [leg('swim', 1500, { distanceM: 1500 })] },
    ];
    expect(legOf(buildRaceProjection(HALF, inputs({ profile: css, pastRaces })), 'swim')).toEqual({
      kind: 'swim',
      sec: 1900,
      source: 'history',
    });
  });

  it('asks for the CSS when nothing is known', () => {
    const projection = buildRaceProjection(HALF, inputs());
    expect(legOf(projection, 'swim')?.source).toBe('default');
    expect(projection?.missing).toContain('Renseigne ta CSS');
  });
});

describe('buildRaceProjection — bike leg', () => {
  const ftp = {
    swimCssSecPer100m: null,
    runThresholdPaceSecPerKm: null,
    ftpW: 200,
    weightKg: 81.2,
    lthr: null,
    maxHr: null,
  };

  it('takes the median recent long-ride speed', () => {
    const rides = [ride(5, 80, 26), ride(12, 80, 27.2), ride(30, 90, 28), ride(40, 20, 35)];
    expect(legOf(buildRaceProjection(HALF, inputs({ rides })), 'bike')).toEqual({
      kind: 'bike',
      sec: Math.round(90_000 / (27.2 / 3.6)),
      source: 'recent',
      method: 'median',
    });
  });

  it('widens to all rides when fewer than 3 are recent', () => {
    const rides = [ride(5), ride(200, 80, 25), ride(300, 80, 25)];
    expect(legOf(buildRaceProjection(HALF, inputs({ rides })), 'bike')?.source).toBe('history');
  });

  it('estimates from FTP below 3 long rides, and says so', () => {
    const projection = buildRaceProjection(HALF, inputs({ profile: ftp, rides: [ride(5)] }));
    expect(legOf(projection, 'bike')?.source).toBe('profile');
    expect(projection?.missing).toContain(
      'Moins de 3 sorties vélo longues : vitesse estimée depuis ta FTP',
    );
  });
});

describe('buildRaceProjection — transitions', () => {
  it('uses amateur defaults by format', () => {
    const half = buildRaceProjection(HALF, inputs());
    const olympic = buildRaceProjection(
      { raceFormat: 'Olympique', title: null, targetPerformance: null },
      inputs(),
    );
    expect([legOf(half, 't1')?.sec, legOf(half, 't2')?.sec]).toEqual([420, 270]);
    expect([legOf(olympic, 't1')?.sec, legOf(olympic, 't2')?.sec]).toEqual([240, 150]);
  });

  it('replaces them with the median of past races', () => {
    const pastRaces = [
      {
        date: daysBefore(400),
        multisportLegs: [
          leg('transition', 581, { transitionIndex: 1 }),
          leg('transition', 358, { transitionIndex: 2 }),
        ],
      },
      { date: daysBefore(30), multisportLegs: null },
    ];
    const projection = buildRaceProjection(HALF, inputs({ pastRaces }));
    expect(legOf(projection, 't1')).toEqual({ kind: 't1', sec: 581, source: 'history' });
    expect(legOf(projection, 't2')).toEqual({ kind: 't2', sec: 358, source: 'history' });
  });
});

describe('buildRaceProjection — range and formats', () => {
  it('returns null for a format it does not know', () => {
    expect(
      buildRaceProjection(
        { raceFormat: 'Trail 30 km', title: null, targetPerformance: null },
        inputs(),
      ),
    ).toBeNull();
  });

  it('spreads ±6 % on defaults only', () => {
    const projection = buildRaceProjection(HALF, inputs())!;
    expect(projection.confidence).toBe('low');
    expect(projection.highSec - projection.finishSec).toBe(Math.round(projection.finishSec * 0.06));
  });
});

describe('buildRaceProjection — backtest on the Versailles Half (5:40:02)', () => {
  const actualSec = 5 * 3600 + 40 * 60 + 2;
  const profile = {
    swimCssSecPer100m: 108,
    runThresholdPaceSecPerKm: 334,
    ftpW: 200,
    weightKg: 81.2,
    lthr: null,
    maxHr: null,
  };

  it('lands within 10 min where the old iOS formula said ~6:05', () => {
    const projection = buildRaceProjection(
      HALF,
      inputs({
        profile,
        // Recent runs consistent with ~5:02/km off the bike: a 46:00 10 km and an easy long run.
        runEfforts: [
          { meters: 10_000, seconds: 2760, date: daysBefore(21) },
          { meters: 16_000, seconds: 5400, date: daysBefore(9) },
          { meters: 8000, seconds: 2640, date: daysBefore(4) },
        ],
        rides: [ride(8), ride(15), ride(22), ride(36, 100), ride(50, 70)],
      }),
    )!;
    // Old iOS model: CSS × 1.07, threshold × 1.08, same bike speed, fixed 2:06 / 1:19.
    const oldSec = 19 * 108 * 1.07 + 90_000 / (27.2 / 3.6) + 21.097 * 334 * 1.08 + 126 + 79;

    expect(Math.abs(projection.finishSec - actualSec)).toBeLessThanOrEqual(600);
    expect(oldSec - actualSec).toBeGreaterThan(20 * 60);
    expect(projection).toMatchObject({ targetSec: 21_600, confidence: 'medium', missing: [] });
    expect(projection.deltaSec).toBe(projection.finishSec - 21_600);
    expect(projection.legs.map((entry) => entry.kind)).toEqual(['swim', 't1', 'bike', 't2', 'run']);
  });
});

describe('buildRaceProjection — an athlete who trains easy (Versailles Half, 5:40:02)', () => {
  // Real race: swim 1429 m in 25:22, T1 9:41, bike 87.8 km in 3:11:56 (HR 140), T2 5:58,
  // run 21.24 km in 1:47:05 (5:02/km, HR 151). Assumed LTHR 165 (prod profile to confirm).
  const actualSec = 5 * 3600 + 40 * 60 + 2;
  const actual = { swim: 1522, swimM: 1429, bike: 11_516, bikeM: 87_800, run: 6425, runM: 21_240 };
  const profile = {
    swimCssSecPer100m: 108,
    runThresholdPaceSecPerKm: 334,
    ftpW: 200,
    weightKg: 81.2,
    lthr: 165,
    maxHr: null,
  };
  // Easy runs every 3–4 days for 26 weeks: 3 s/km slower per bpm below ~153, slowly improving.
  const runEfforts = Array.from({ length: 52 }, (_, i) => {
    const daysAgo = 2 + i * 3.5;
    const hr = 136 + (i % 5) * 3;
    const pace = 290 + 3 * (153.5 - hr) + 0.04 * daysAgo + ((i * 7) % 5) - 2;
    return { meters: 10_000, seconds: pace * 10, avgHr: hr, date: daysBefore(daysAgo) };
  });

  // Plus an 8 km tempo every 4 weeks near race HR.
  const tempos = Array.from({ length: 6 }, (_, i) => ({
    meters: 8000,
    seconds: 291 * 8,
    avgHr: 155,
    date: daysBefore(5 + i * 28),
  }));
  // A weekly long ride, 60–100 km, around the 27.2 km/h median the athlete really rides.
  const rides = Array.from({ length: 26 }, (_, i) =>
    ride(3 + i * 7, 60 + (i % 5) * 10, 26.6 + (i % 4) * 0.4),
  );
  const evidence = { profile, runEfforts: [...runEfforts, ...tempos], rides };

  /** Model pace over the real leg distances: the course was short on the swim and bike. */
  function normalisedTotal(projection: NonNullable<ReturnType<typeof buildRaceProjection>>) {
    const sec = (kind: string) => legOf(projection, kind)!.sec;
    return (
      (sec('swim') * actual.swimM) / 1900 +
      sec('t1') +
      (sec('bike') * actual.bikeM) / 90_000 +
      sec('t2') +
      (sec('run') * actual.runM) / 21_097
    );
  }

  it('reads the run off the HR curve and the bike off the median ride, within 10 min normalised', () => {
    const projection = buildRaceProjection(HALF, inputs(evidence))!;

    expect(legOf(projection, 'run')?.method).toBe('hr-curve');
    expect(legOf(projection, 'bike')?.method).toBe('median');
    expect(Math.abs(normalisedTotal(projection) - actualSec)).toBeLessThanOrEqual(600);
    expect(
      Math.abs(legOf(projection, 'run')!.sec * (actual.runM / 21_097) - actual.run),
    ).toBeLessThan(300);
  });

  it('never lets the HR curve beat the decayed best by more than 3 %', () => {
    // A steep curve (8 s/km per bpm) extrapolated 15 bpm would promise ~2 min/km faster.
    const steep = runEfforts.map((effort) => ({
      ...effort,
      seconds: (290 + 8 * (153.5 - effort.avgHr)) * 10,
    }));
    const projection = buildRaceProjection(HALF, inputs({ ...evidence, runEfforts: steep }))!;
    const best = Math.min(...steep.map((effort) => effort.seconds)) * (21_097 / 10_000) ** 1.06;
    const run = legOf(projection, 'run')!;

    expect(run.method).toBe('hr-curve');
    expect(run.sec).toBeGreaterThanOrEqual(Math.floor(best * 0.97 * 1.04));
  });

  it('falls back to the decayed best when HR barely explains pace', () => {
    const flat = runEfforts.map((effort, i) => ({
      ...effort,
      seconds: (300 + ((i * 37) % 40)) * 10,
    }));
    const projection = buildRaceProjection(HALF, inputs({ ...evidence, runEfforts: flat }))!;
    expect(legOf(projection, 'run')?.method).toBe('decayed-best');
  });

  it('moves smoothly as of 8, 4 and 0 weeks before the race', () => {
    const raceGoal = { ...HALF, targetDate: RACE_DAY };
    const finishes = [8, 4, 0].map((weeks) =>
      buildRaceProjection(raceGoal, inputs({ ...evidence, asOf: daysBefore(weeks * 7) }))!,
    );
    for (const [before, after] of [
      [finishes[0], finishes[1]],
      [finishes[1], finishes[2]],
    ]) {
      expect(Math.abs(before.finishSec - after.finishSec)).toBeLessThan(5 * 60);
    }
    for (const projection of finishes) {
      expect(Math.abs(projection.trend.secPerWeek ?? 0)).toBeLessThan(60);
    }
  });
});

describe('buildRaceProjection — race-day projection', () => {
  const asOf = daysBefore(56);
  const raceIn8Weeks = { ...HALF, targetDate: RACE_DAY };
  // A 10 km getting 30 s faster every week over the last 6 weeks.
  const improvingRuns = [0, 1, 2, 3, 4, 5].map((week) => ({
    meters: 10_000,
    seconds: 2760 + 30 * (5 - week),
    date: new Date(asOf.getTime() - (6 - week) * 7 * 86_400_000),
  }));
  const steadyWeeks = Array.from({ length: 8 }, (_, week) => ({
    date: new Date(asOf.getTime() - (week * 7 + 3) * 86_400_000),
    durationSec: 6 * 3600,
  }));

  it('carries an improving run forward to race day, weighted by regularity', () => {
    const projection = buildRaceProjection(
      raceIn8Weeks,
      inputs({ asOf, runEfforts: improvingRuns, trainingVolume: steadyWeeks }),
    )!;

    expect(projection.regularity).toBe(1);
    expect(projection.trend.secPerWeek).toBeLessThan(0);
    expect(projection.finishSec).toBeLessThan(projection.todaySec);
    // Capped at 1 %/week on the run leg.
    const run = legOf(projection, 'run')!.sec;
    expect(projection.todaySec - projection.finishSec).toBeLessThanOrEqual(Math.ceil(run * 0.08));
  });

  it('applies no trend once the race has come', () => {
    const projection = buildRaceProjection(
      raceIn8Weeks,
      inputs({ asOf: RACE_DAY, runEfforts: improvingRuns, trainingVolume: steadyWeeks }),
    )!;
    expect(projection.finishSec).toBe(projection.todaySec);
  });

  it('widens the range when training is irregular', () => {
    const regular = buildRaceProjection(
      raceIn8Weeks,
      inputs({ asOf, trainingVolume: steadyWeeks }),
    )!;
    const irregular = buildRaceProjection(
      raceIn8Weeks,
      inputs({ asOf, trainingVolume: [steadyWeeks[0]] }),
    )!;
    expect(irregular.regularity).toBe(0);
    expect(irregular.highSec - irregular.finishSec).toBeGreaterThan(
      regular.highSec - regular.finishSec,
    );
  });
});

describe('projection freeze', () => {
  const race = { kind: 'RACE', targetDate: '2026-10-11T00:00:00Z', frozenProjectionAt: null };

  it('freezes from the eve of the race on, once', () => {
    expect(shouldFreezeProjection(race, '2026-10-09')).toBe(false);
    expect(shouldFreezeProjection(race, '2026-10-10')).toBe(true);
    expect(shouldFreezeProjection(race, '2026-10-13')).toBe(true);
    expect(shouldFreezeProjection({ ...race, frozenProjectionAt: new Date() }, '2026-10-10')).toBe(
      false,
    );
    expect(shouldFreezeProjection({ ...race, kind: 'METRIC' }, '2026-10-10')).toBe(false);
  });

  it('cuts evidence off at race day once it has come', () => {
    const now = new Date('2026-10-13T08:00:00Z');
    expect(projectionAsOf('2026-10-11T00:00:00Z', now)).toEqual(RACE_DAY);
    expect(projectionAsOf('2026-12-01T00:00:00Z', now)).toEqual(now);
    expect(projectionAsOf(null, now)).toEqual(now);
  });
});

describe('buildRaceProjection — structured races (ADR-082)', () => {
  const NO_TEXT = { raceFormat: null, title: null, targetPerformance: null, targetDate: RACE_DAY };
  const evidence = inputs({
    rides: [ride(10), ride(20), ride(30)],
    profile: { ...inputs().profile, swimCssSecPer100m: 110, runThresholdPaceSecPerKm: 300 },
  });
  const finish = (fields: Record<string, unknown>) =>
    buildRaceProjection({ ...NO_TEXT, ...fields }, evidence)!;

  it('projects a fixed format exactly as its free text did', () => {
    expect(finish({ discipline: 'TRIATHLON', formatKey: 'TRI_L', targetSeconds: 21_600 })).toEqual(
      buildRaceProjection({ ...HALF, targetDate: RACE_DAY }, evidence),
    );
    expect(finish({ discipline: 'RUN', formatKey: 'RUN_SEMI' })).toEqual(
      buildRaceProjection({ ...NO_TEXT, raceFormat: 'Semi' }, evidence),
    );
  });

  it('runs a trail as its flat-equivalent distance (100 m D+ ≈ 1 km)', () => {
    const trail = finish({
      discipline: 'TRAIL',
      formatKey: 'TRAIL_CUSTOM',
      runM: 30_000,
      runElevationM: 1500,
    });
    expect(trail.finishSec).toBe(
      finish({ discipline: 'RUN', formatKey: 'RUN_CUSTOM', runM: 45_000 }).finishSec,
    );
  });

  it('slows the bike by 15 flat km per 1000 m D+', () => {
    const flat = finish({
      discipline: 'BIKE',
      formatKey: 'BIKE_CUSTOM',
      bikeM: 100_000,
      bikeElevationM: 0,
    });
    const hilly = finish({
      discipline: 'BIKE',
      formatKey: 'BIKE_CUSTOM',
      bikeM: 100_000,
      bikeElevationM: 2000,
    });
    expect(flat.legs.map((l) => l.kind)).toEqual(['bike']);
    expect(hilly.finishSec / flat.finishSec).toBeCloseTo(1.3, 2);
  });

  it('prices a swim race from CSS by distance and water', () => {
    const pool = finish({ discipline: 'SWIM', formatKey: 'SWIM_1_5K', openWater: false });
    const open = finish({ discipline: 'SWIM', formatKey: 'SWIM_1_5K', openWater: true });
    const long = finish({ discipline: 'SWIM', formatKey: 'SWIM_10K', openWater: false });
    expect(pool.finishSec).toBe(15 * 110);
    expect(open.finishSec / pool.finishSec).toBeCloseTo(1.03, 2);
    expect(long.finishSec / 100).toBeGreaterThan(pool.finishSec / 15);
  });

  it('splits a duathlon into run, bike and a slower second run', () => {
    const duathlon = finish({ discipline: 'DUATHLON', formatKey: 'DUA_M' });
    expect(duathlon.legs.map((l) => l.kind)).toEqual(['run', 't1', 'bike', 't2', 'run']);
    const [run1, , , , run2] = duathlon.legs;
    expect(run2!.sec / 5000).toBeGreaterThan(run1!.sec / 10_000);
  });

  it('projects a swimrun as swim (with entries and exits) and run', () => {
    const swimrun = finish({
      discipline: 'SWIMRUN',
      formatKey: 'SWIMRUN_CUSTOM',
      swimM: 4000,
      runM: 20_000,
      segments: 10,
    });
    expect(swimrun.legs.map((l) => l.kind)).toEqual(['swim', 'run']);
    expect(swimrun.legs[0]!.sec).toBe(Math.round(40 * 110 * 1.1 + 10 * 30));
  });

  it('falls back to the free text when the structured race is unknown', () => {
    const fallback = finish({ discipline: 'TRIATHLON', formatKey: 'NOPE', raceFormat: 'Marathon' });
    expect(fallback.legs.map((l) => l.kind)).toEqual(['run']);
  });
});

describe('projectionVerdict', () => {
  const range = { lowSec: 10_000, highSec: 11_000 };
  it('reads a target against the race-day range', () => {
    expect(projectionVerdict(range, 9600)).toBe('ambitious');
    expect(projectionVerdict(range, 9800)).toBe('realistic');
    expect(projectionVerdict(range, 11_000)).toBe('realistic');
    expect(projectionVerdict(range, 11_001)).toBe('cautious');
    expect(projectionVerdict(range, null)).toBeNull();
  });
});

describe('structuredRaceFromText', () => {
  it('maps the formats the projection recognised', () => {
    expect(structuredRaceFromText(HALF)).toEqual({
      discipline: 'TRIATHLON',
      formatKey: 'TRI_L',
      targetSeconds: 21_600,
    });
    expect(
      structuredRaceFromText({
        raceFormat: 'Marathon',
        title: null,
        targetPerformance: 'Terminer',
      }),
    ).toEqual({ discipline: 'RUN', formatKey: 'RUN_MARATHON', targetSeconds: null });
    expect(
      structuredRaceFromText({ raceFormat: 'Trail 30 km', title: null, targetPerformance: null }),
    ).toBeNull();
  });
});
