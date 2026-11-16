import { ActivityType } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';

/** Seuils athlète pour le calcul des zones et métriques avancées. */
export interface AthleteThresholds {
  ftp: number | null;
  maxHr: number | null;
  lthr: number | null;
  runThresholdPaceSecPerKm: number | null;
  source: 'profile' | 'estimate';
}

export interface ZoneBucket {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  seconds: number;
  percent: number;
}

export interface SplitRow {
  index: number;
  label: string;
  distanceM: number;
  durationSec: number;
  paceSecPerKm: number | null;
  avgHr: number | null;
  avgWatts: number | null;
  elevationGainM: number | null;
}

export interface ActivityAnalysis {
  thresholds: AthleteThresholds;
  load: {
    tss: number | null;
    intensityFactor: number | null;
    method: 'power' | 'hr' | null;
  };
  hr: {
    zones: ZoneBucket[];
    decouplingPct: number | null;
    efficiencyFactor: number | null;
    efficiencyLabel: string;
    avgHr: number | null;
    maxHr: number | null;
  };
  power: {
    normalized: number | null;
    avg: number | null;
    variabilityIndex: number | null;
    intensityFactor: number | null;
    tss: number | null;
    zones: ZoneBucket[];
  } | null;
  run: {
    splits: SplitRow[];
    paceVariabilityPct: number | null;
    avgPaceSecPerKm: number | null;
  } | null;
  bike: {
    splits: SplitRow[];
  } | null;
}

interface RawPoint {
  t: number;
  d: number;
  hr: number;
  watts: number;
  speed: number;
  alt: number;
}

interface ZoneDef {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  minPct: number;
  maxPct: number | null;
}

const PHYSIO_ZONE_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
] as const;

const HR_ZONE_DEFS: ZoneDef[] = [
  {
    id: 'z1',
    label: 'Récupération',
    shortLabel: 'Z1',
    color: PHYSIO_ZONE_COLORS[0],
    minPct: 0,
    maxPct: 81,
  },
  {
    id: 'z2',
    label: 'Endurance',
    shortLabel: 'Z2',
    color: PHYSIO_ZONE_COLORS[1],
    minPct: 81,
    maxPct: 89,
  },
  {
    id: 'z3',
    label: 'Tempo',
    shortLabel: 'Z3',
    color: PHYSIO_ZONE_COLORS[2],
    minPct: 89,
    maxPct: 93,
  },
  {
    id: 'z4',
    label: 'Seuil',
    shortLabel: 'Z4',
    color: PHYSIO_ZONE_COLORS[3],
    minPct: 93,
    maxPct: 100,
  },
  {
    id: 'z5',
    label: 'VO2max+',
    shortLabel: 'Z5',
    color: PHYSIO_ZONE_COLORS[4],
    minPct: 100,
    maxPct: null,
  },
];

const POWER_ZONE_DEFS: ZoneDef[] = [
  {
    id: 'z1',
    label: 'Récupération active',
    shortLabel: 'Z1',
    color: 'var(--signal-neutral)',
    minPct: 0,
    maxPct: 55,
  },
  {
    id: 'z2',
    label: 'Endurance',
    shortLabel: 'Z2',
    color: PHYSIO_ZONE_COLORS[0],
    minPct: 55,
    maxPct: 75,
  },
  {
    id: 'z3',
    label: 'Tempo',
    shortLabel: 'Z3',
    color: PHYSIO_ZONE_COLORS[2],
    minPct: 75,
    maxPct: 90,
  },
  {
    id: 'z4',
    label: 'Seuil lactique',
    shortLabel: 'Z4',
    color: PHYSIO_ZONE_COLORS[3],
    minPct: 90,
    maxPct: 105,
  },
  {
    id: 'z5',
    label: 'VO2max',
    shortLabel: 'Z5',
    color: PHYSIO_ZONE_COLORS[4],
    minPct: 105,
    maxPct: 120,
  },
  {
    id: 'z6',
    label: 'Capacité anaérobie',
    shortLabel: 'Z6',
    color: 'var(--signal-caution)',
    minPct: 120,
    maxPct: 150,
  },
  {
    id: 'z7',
    label: 'Neuromusculaire',
    shortLabel: 'Z7',
    color: 'var(--signal-risk)',
    minPct: 150,
    maxPct: null,
  },
];

function mean(arr: number[]): number {
  if (!arr.length) {
    return 0;
  }
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function segmentMean(arr: number[], start: number, end: number): number | null {
  const slice = arr.slice(start, end + 1).filter((v) => v > 0);
  if (!slice.length) {
    return null;
  }
  return mean(slice);
}

function buildPoints(raw: {
  time: number[];
  distance: number[];
  heartrate: number[];
  watts: number[];
  velocity: number[];
  altitude: number[];
}): RawPoint[] {
  const len = Math.max(raw.time.length, raw.distance.length, raw.heartrate.length);
  const points: RawPoint[] = [];
  for (let i = 0; i < len; i++) {
    points.push({
      t: raw.time[i] ?? 0,
      d: raw.distance[i] ?? 0,
      hr: raw.heartrate[i] ?? 0,
      watts: raw.watts[i] ?? 0,
      speed: raw.velocity[i] ?? 0,
      alt: raw.altitude[i] ?? 0,
    });
  }
  return points;
}

function zoneIndex(value: number, ref: number, defs: ZoneDef[]): number {
  const pct = (value / ref) * 100;
  for (let i = 0; i < defs.length; i++) {
    const z = defs[i];
    if (pct >= z.minPct && (z.maxPct === undefined || z.maxPct === null || pct < z.maxPct)) {
      return i;
    }
  }
  return defs.length - 1;
}

/** The power zone a wattage falls in for this FTP, from 0 (Z1), by the bounds of the zone times. */
export function powerZoneIndex(watts: number, ftp: number): number {
  return zoneIndex(watts, ftp, POWER_ZONE_DEFS);
}

function computeZoneTimes(
  values: number[],
  times: number[],
  ref: number,
  defs: ZoneDef[],
): ZoneBucket[] {
  const seconds = new Array(defs.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v <= 0) {
      continue;
    }
    const dt = Math.max(0, times[i] - times[i - 1]);
    if (dt <= 0 || dt > 120) {
      continue;
    }
    seconds[zoneIndex(v, ref, defs)] += dt;
  }
  const total = seconds.reduce((s, v) => s + v, 0) || 1;
  return defs.map((z, i) => ({
    id: z.id,
    label: z.label,
    shortLabel: z.shortLabel,
    color: z.color,
    seconds: Math.round(seconds[i]),
    percent: Math.round((seconds[i] / total) * 100),
  }));
}

function computeNormalizedPower(watts: number[], time: number[]): number | null {
  const valid = watts.filter((w) => w > 0);
  if (valid.length < 30) {
    return null;
  }

  const buckets: number[] = [];
  let [windowStart] = time;
  let windowWatts: number[] = [];

  for (let i = 0; i < watts.length; i++) {
    while (time[i] - windowStart >= 30) {
      if (windowWatts.length) {
        buckets.push(mean(windowWatts));
      }
      windowStart += 30;
      windowWatts = [];
    }
    if (watts[i] > 0) {
      windowWatts.push(watts[i]);
    }
  }
  if (windowWatts.length) {
    buckets.push(mean(windowWatts));
  }
  if (!buckets.length) {
    return null;
  }

  const fourth = buckets.map((b) => b ** 4);
  return Math.round(Math.pow(fourth.reduce((s, v) => s + v, 0) / fourth.length, 0.25));
}

function splitDecouplingSegments(
  points: RawPoint[],
): { first: RawPoint[]; second: RawPoint[] } | null {
  const duration = points[points.length - 1].t - points[0].t;
  const warmupEnd = points[0].t + 10 * 60;
  const mid = points[0].t + duration / 2;
  const first: RawPoint[] = [];
  const second: RawPoint[] = [];

  for (const p of points) {
    if (p.t < warmupEnd) {
      continue;
    }
    if (p.t < mid) {
      first.push(p);
    } else {
      second.push(p);
    }
  }
  if (first.length < 30 || second.length < 30) {
    return null;
  }
  return { first, second };
}

function segmentEfficiency(seg: RawPoint[], mode: 'pace' | 'power'): number | null {
  const hrs = seg.map((p) => p.hr).filter((h) => h > 0);
  if (!hrs.length) {
    return null;
  }
  const avgHr = mean(hrs);
  if (mode === 'power') {
    const ws = seg.map((p) => p.watts).filter((w) => w > 0);
    return ws.length ? mean(ws) / avgHr : null;
  }
  const speeds = seg.map((p) => p.speed).filter((s) => s > 0.5);
  return speeds.length ? mean(speeds) / avgHr : null;
}

function computeDecoupling(points: RawPoint[], mode: 'pace' | 'power'): number | null {
  if (points.length < 120) {
    return null;
  }
  const duration = points[points.length - 1].t - points[0].t;
  if (duration < 30 * 60) {
    return null;
  }

  const segments = splitDecouplingSegments(points);
  if (!segments) {
    return null;
  }

  const ef1 = segmentEfficiency(segments.first, mode);
  const ef2 = segmentEfficiency(segments.second, mode);
  if (!isSet(ef1) || !isSet(ef2) || ef1 === 0) {
    return null;
  }
  return Number((((ef1 - ef2) / ef1) * 100).toFixed(1));
}

function splitElevationGain(points: RawPoint[], startIdx: number, endIdx: number): number {
  let elevGain = 0;
  for (let j = startIdx + 1; j <= endIdx; j++) {
    const diff = points[j].alt - points[j - 1].alt;
    if (diff > 0) {
      elevGain += diff;
    }
  }
  return elevGain;
}

function splitLabel(
  target: number,
  splitM: number,
  isPartialTailSplit: boolean,
  totalDistance: number,
): string {
  if (isPartialTailSplit) {
    return formatSplitDistanceLabel(totalDistance);
  }
  if (splitM >= 1000) {
    return `${(target / 1000).toFixed(0)} km`;
  }
  return `${target} m`;
}

function buildSplitRow(input: {
  points: RawPoint[];
  startIdx: number;
  endIdx: number;
  target: number;
  splitM: number;
  isPartialTailSplit: boolean;
  splitIndex: number;
}): SplitRow {
  const { points, startIdx, endIdx, target, splitM, isPartialTailSplit, splitIndex } = input;
  const dist = points[endIdx].d - points[startIdx].d;
  const dur = points[endIdx].t - points[startIdx].t;
  const pace = dist > 0 ? (dur / dist) * 1000 : null;
  const elevGain = splitElevationGain(points, startIdx, endIdx);
  return {
    index: splitIndex,
    label: splitLabel(target, splitM, isPartialTailSplit, points[endIdx].d),
    distanceM: Math.round(dist),
    durationSec: Math.round(dur),
    paceSecPerKm: isSet(pace) ? Math.round(pace) : null,
    avgHr: segmentMean(
      points.map((p) => p.hr),
      startIdx,
      endIdx,
    ),
    avgWatts: segmentMean(
      points.map((p) => p.watts),
      startIdx,
      endIdx,
    ),
    elevationGainM: elevGain > 0 ? Math.round(elevGain) : null,
  };
}

function shouldSkipSplitPoint(input: {
  points: RawPoint[];
  index: number;
  startIdx: number;
  target: number;
  splitM: number;
}): boolean {
  const { points, index, startIdx, target, splitM } = input;
  const isLast = index === points.length - 1;
  if (points[index].d < target && !isLast) {
    return true;
  }
  const dist = points[index].d - points[startIdx].d;
  return dist < splitM * 0.5 && !isLast;
}

function computeSplits(points: RawPoint[], splitM: number): SplitRow[] {
  if (points.length < 2) {
    return [];
  }
  const splits: SplitRow[] = [];
  let target = splitM;
  let startIdx = 0;

  for (let i = 1; i < points.length; i++) {
    if (shouldSkipSplitPoint({ points, index: i, startIdx, target, splitM })) {
      continue;
    }

    splits.push(
      buildSplitRow({
        points,
        startIdx,
        endIdx: i,
        target,
        splitM,
        isPartialTailSplit: i === points.length - 1 && points[i].d - points[startIdx].d < splitM,
        splitIndex: splits.length + 1,
      }),
    );

    startIdx = i;
    target += splitM;
    if (i === points.length - 1) {
      break;
    }
  }
  return splits;
}

function formatSplitDistanceLabel(distanceM: number): string {
  const roundedMeters = Math.round(distanceM);
  if (roundedMeters < 1000) {
    return `${roundedMeters} m`;
  }
  const km = roundedMeters / 1000;
  const decimals = km >= 10 ? 1 : 2;
  const formatted = Number.isInteger(km) ? km.toFixed(0) : km.toFixed(decimals).replace('.', ',');
  return `${formatted} km`;
}

function paceVariability(points: RawPoint[]): number | null {
  const paces: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dd = points[i].d - points[i - 1].d;
    const dt = points[i].t - points[i - 1].t;
    if (dd > 5 && dt > 0) {
      paces.push((dt / dd) * 1000);
    }
  }
  if (paces.length < 20) {
    return null;
  }
  const avg = mean(paces);
  if (avg === 0) {
    return null;
  }
  const variance = paces.reduce((s, p) => s + (p - avg) ** 2, 0) / paces.length;
  return Number(((Math.sqrt(variance) / avg) * 100).toFixed(1));
}

export interface AnalysisContext {
  type: ActivityType;
  durationSec: number | null;
  bikeNormalizedPower: number | null;
  bikeIntensityFactor: number | null;
}

export interface ProfileInput {
  ftpW: number | null;
  maxHr: number | null;
  lthr: number | null;
  runThresholdPaceSecPerKm: number | null;
}

function estimateFtpFromStreamPeaks(watts: number[]): number | null {
  const sorted = [...watts].filter((w) => w > 0).sort((a, b) => b - a);
  if (sorted.length <= 60) {
    return null;
  }
  const top = sorted.slice(0, Math.floor(sorted.length * 0.05));
  return Math.round(mean(top) * 0.95);
}

function estimateFtpFromStreams(
  profileFtp: number | null | undefined,
  ctx: AnalysisContext,
  watts: number[],
): number | null {
  if (profileFtp) {
    return profileFtp;
  }
  if (ctx.bikeNormalizedPower && ctx.bikeIntensityFactor && ctx.bikeIntensityFactor > 0) {
    return Math.round(ctx.bikeNormalizedPower / ctx.bikeIntensityFactor);
  }
  if (!watts.length) {
    return null;
  }
  return estimateFtpFromStreamPeaks(watts);
}

function resolveMaxHr(profile: ProfileInput | null, rawHr: number[]): number | null {
  const streamMaxHr = rawHr.length ? Math.max(...rawHr.filter((h) => h > 0)) : null;
  return profile?.maxHr ?? streamMaxHr;
}

function resolveLthr(profile: ProfileInput | null, maxHr: number | null): number | null {
  if (profile?.lthr) {
    return profile.lthr;
  }
  return maxHr ? Math.round(maxHr * 0.85) : null;
}

function thresholdSource(profile: ProfileInput | null): AthleteThresholds['source'] {
  const hasProfile = Boolean(profile?.ftpW || profile?.lthr || profile?.maxHr);
  return hasProfile ? 'profile' : 'estimate';
}

export function resolveThresholds(
  profile: ProfileInput | null,
  raw: {
    heartrate: number[];
    watts: number[];
  },
  ctx: AnalysisContext,
): AthleteThresholds {
  const maxHr = resolveMaxHr(profile, raw.heartrate);
  return {
    ftp: estimateFtpFromStreams(profile?.ftpW, ctx, raw.watts),
    maxHr: maxHr ?? null,
    lthr: resolveLthr(profile, maxHr),
    runThresholdPaceSecPerKm: profile?.runThresholdPaceSecPerKm ?? null,
    source: thresholdSource(profile),
  };
}

function computeSessionLoad(input: {
  duration: number;
  avgHr: number | null;
  lthr: number | null;
  powerTss: number | null;
  powerIf: number | null;
}): { loadTss: number | null; loadIf: number | null; loadMethod: 'power' | 'hr' | null } {
  const { duration, avgHr, lthr, powerTss, powerIf } = input;
  if (isSet(powerTss) && isSet(powerIf)) {
    return { loadTss: powerTss, loadIf: powerIf, loadMethod: 'power' };
  }
  if (avgHr && lthr && lthr > 0) {
    const loadIf = Number((avgHr / lthr).toFixed(2));
    return {
      loadTss: Math.round((duration / 3600) * loadIf ** 2 * 100),
      loadIf,
      loadMethod: 'hr',
    };
  }
  return { loadTss: null, loadIf: null, loadMethod: null };
}

function computeEfficiencyMetrics(
  ctx: AnalysisContext,
  avgHr: number | null,
  avgWatts: number | null,
  rawVelocity: number[],
): { efficiencyFactor: number | null; efficiencyLabel: string } {
  if (!avgHr) {
    return { efficiencyFactor: null, efficiencyLabel: "Facteur d'efficacité" };
  }
  if (ctx.type === ActivityType.BIKE && avgWatts) {
    return {
      efficiencyFactor: Number((avgWatts / avgHr).toFixed(2)),
      efficiencyLabel: 'Efficacité (W/bpm)',
    };
  }
  if (ctx.type === ActivityType.RUN) {
    const speeds = rawVelocity.filter((s) => s > 0.5);
    if (speeds.length) {
      return {
        efficiencyFactor: Number(((mean(speeds) / avgHr) * 1000).toFixed(2)),
        efficiencyLabel: 'Efficacité (m/bpm)',
      };
    }
  }
  return { efficiencyFactor: null, efficiencyLabel: "Facteur d'efficacité" };
}

function computeRunAvgPace(rawDistance: number[], rawTime: number[]): number | null {
  if (!rawDistance.length) {
    return null;
  }
  const totalD = rawDistance[rawDistance.length - 1];
  const totalT = rawTime[rawTime.length - 1];
  return totalD > 0 ? Math.round((totalT / totalD) * 1000) : null;
}

function computePowerIf(np: number | null, ftp: number | null): number | null {
  if (!np || !ftp || ftp <= 0) {
    return null;
  }
  return Number((np / ftp).toFixed(2));
}

function computePowerTss(
  np: number | null,
  powerIf: number | null,
  ftp: number | null,
  duration: number,
): number | null {
  if (!np || powerIf === undefined || powerIf === null || !ftp) {
    return null;
  }
  return Math.round(((duration * np * powerIf) / (ftp * 3600)) * 100);
}

function computePowerLoadScalars(
  np: number | null,
  avgWatts: number | null,
  ftp: number | null,
  duration: number,
) {
  const vi = np && avgWatts && avgWatts > 0 ? Number((np / avgWatts).toFixed(2)) : null;
  const powerIf = computePowerIf(np, ftp);
  const powerTss = computePowerTss(np, powerIf, ftp, duration);
  return { vi, powerIf, powerTss };
}

function computePowerMetrics(
  raw: { watts: number[]; time: number[] },
  isBike: boolean,
  duration: number,
  ftp: number | null,
) {
  const watts = raw.watts.filter((w) => w > 0);
  const np = isBike && watts.length > 30 ? computeNormalizedPower(raw.watts, raw.time) : null;
  const avgWatts = watts.length ? Math.round(mean(watts)) : null;
  const load = computePowerLoadScalars(np, avgWatts, ftp, duration);
  return { watts, np, avgWatts, ...load };
}

function buildPowerAnalysis(
  raw: { watts: number[]; time: number[] },
  isBike: boolean,
  duration: number,
  ftp: number | null,
) {
  const metrics = computePowerMetrics(raw, isBike, duration, ftp);
  const powerZones =
    ftp && metrics.watts.length ? computeZoneTimes(raw.watts, raw.time, ftp, POWER_ZONE_DEFS) : [];

  return {
    np: metrics.np,
    avgWatts: metrics.avgWatts,
    vi: metrics.vi,
    powerIf: metrics.powerIf,
    powerTss: metrics.powerTss,
    powerZones,
    powerBlock:
      isBike && metrics.watts.length > 30
        ? {
            normalized: metrics.np,
            avg: metrics.avgWatts,
            variabilityIndex: metrics.vi,
            intensityFactor: metrics.powerIf,
            tss: metrics.powerTss,
            zones: powerZones,
          }
        : null,
  };
}

function buildHrAnalysis(input: {
  raw: { heartrate: number[]; time: number[] };
  lthr: number | null;
  points: RawPoint[];
  decouplingMode: 'pace' | 'power';
  ctx: AnalysisContext;
  avgWatts: number | null;
  rawVelocity: number[];
}) {
  const { raw, lthr, points, decouplingMode, ctx, avgWatts, rawVelocity } = input;
  const hrs = raw.heartrate.filter((h) => h > 0);
  const avgHr = hrs.length ? mean(hrs) : null;
  const efficiency = computeEfficiencyMetrics(ctx, avgHr, avgWatts, rawVelocity);
  const hrZones =
    lthr && hrs.length ? computeZoneTimes(raw.heartrate, raw.time, lthr, HR_ZONE_DEFS) : [];
  const decoupling = lthr && hrs.length ? computeDecoupling(points, decouplingMode) : null;

  return {
    avgHr,
    hrBlock: {
      zones: hrZones,
      decouplingPct: decoupling,
      efficiencyFactor: efficiency.efficiencyFactor,
      efficiencyLabel: efficiency.efficiencyLabel,
      avgHr: isSet(avgHr) ? Math.round(avgHr) : null,
      maxHr: hrs.length ? Math.max(...hrs) : null,
    },
  };
}

function buildSportAnalysisSections(
  ctx: AnalysisContext,
  points: RawPoint[],
  raw: { distance: number[]; time: number[] },
) {
  const runSplits =
    ctx.type === ActivityType.RUN && raw.distance.length ? computeSplits(points, 1000) : [];
  const bikeSplits =
    ctx.type === ActivityType.BIKE && raw.distance.length ? computeSplits(points, 5000) : [];

  return {
    run:
      ctx.type === ActivityType.RUN
        ? {
            splits: runSplits,
            paceVariabilityPct: paceVariability(points),
            avgPaceSecPerKm: computeRunAvgPace(raw.distance, raw.time),
          }
        : null,
    bike: ctx.type === ActivityType.BIKE ? { splits: bikeSplits } : null,
  };
}

function prepareActivityStreamAnalysis(
  raw: {
    time: number[];
    distance: number[];
    heartrate: number[];
    watts: number[];
    velocity: number[];
    altitude: number[];
  },
  thresholds: AthleteThresholds,
  ctx: AnalysisContext,
  points: RawPoint[],
) {
  const isBike = ctx.type === ActivityType.BIKE;
  const { lthr } = thresholds;
  const ftp = isBike ? thresholds.ftp : null;
  const duration = ctx.durationSec ?? points[points.length - 1].t;
  const power = buildPowerAnalysis(raw, isBike, duration, ftp);
  const decouplingMode = isBike && raw.watts.filter((w) => w > 0).length > 30 ? 'power' : 'pace';
  const hr = buildHrAnalysis({
    raw,
    lthr,
    points,
    decouplingMode,
    ctx,
    avgWatts: power.avgWatts,
    rawVelocity: raw.velocity,
  });
  const sessionLoad = computeSessionLoad({
    duration,
    avgHr: hr.avgHr,
    lthr,
    powerTss: power.powerTss,
    powerIf: power.powerIf,
  });
  const sports = buildSportAnalysisSections(ctx, points, raw);

  return { sessionLoad, hr, power, sports };
}

export function analyzeActivityStreams(
  raw: {
    time: number[];
    distance: number[];
    heartrate: number[];
    watts: number[];
    velocity: number[];
    altitude: number[];
  },
  thresholds: AthleteThresholds,
  ctx: AnalysisContext,
): ActivityAnalysis | null {
  const points = buildPoints(raw);
  if (points.length < 10) {
    return null;
  }

  const { sessionLoad, hr, power, sports } = prepareActivityStreamAnalysis(
    raw,
    thresholds,
    ctx,
    points,
  );

  return {
    thresholds,
    load: {
      tss: sessionLoad.loadTss,
      intensityFactor: sessionLoad.loadIf,
      method: sessionLoad.loadMethod,
    },
    hr: hr.hrBlock,
    power: power.powerBlock,
    run: sports.run,
    bike: sports.bike,
  };
}
