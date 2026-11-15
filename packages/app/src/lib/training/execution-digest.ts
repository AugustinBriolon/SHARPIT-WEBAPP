/**
 * What the athlete's recorded sessions measured over the last weeks, per sport: where the time
 * went, whether any session held real intensity, and how the heart drifted on long outings.
 * Read from the session feature sets already stored for each activity — no stream is processed
 * here. Efficiency and intensity factors are left out on purpose: a run recorded with running
 * power is divided by the cycling FTP upstream, so neither figure compares across sessions.
 */

export interface ExecutionSession {
  sport: string;
  /** Training day, « yyyy-MM-dd ». */
  day: string;
  durationSec: number;
  /** Minutes in zones 1 to 5, or null when the session had no stream. */
  timeInZones: readonly number[] | null;
  hrDriftPercent: number | null;
}

export interface ZoneShares {
  /** Zones 1–2, below the first threshold. */
  easy: number;
  /** Zone 3. */
  middle: number;
  /** Zones 4–5, at the threshold and above. */
  hard: number;
  /** Sessions that carried zone times. */
  measuredSessions: number;
}

export interface SportExecutionDigest {
  sport: string;
  sessions: number;
  hours: number;
  zones: ZoneShares | null;
  /** Sessions with `HARD_SESSION_MINUTES` or more at the threshold and above. */
  hardSessions: number;
  lastHardDay: string | null;
  /** Median heart-rate drift of the long sessions, in percent; null under `MIN_SAMPLE`. */
  longSessionDrift: { medianPercent: number; sessions: number } | null;
}

export const EXECUTION_WINDOW_DAYS = 56;
export const HARD_SESSION_MINUTES = 8;
const LONG_SESSION_SEC = 3600;
/** Under this many values a median or a trend says nothing. */
const MIN_SAMPLE = 3;
const DIGEST_SPORTS = ['RUN', 'BIKE', 'SWIM'] as const;

const DAY_MS = 86_400_000;

function median(values: readonly number[]): number | null {
  if (values.length < MIN_SAMPLE) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function hardMinutes(session: ExecutionSession): number {
  return (session.timeInZones?.[3] ?? 0) + (session.timeInZones?.[4] ?? 0);
}

function zoneShares(sessions: readonly ExecutionSession[]): ZoneShares | null {
  const measured = sessions.filter((session) => session.timeInZones?.length === 5);
  const totals = [0, 1, 2, 3, 4].map((zone) =>
    measured.reduce((sum, session) => sum + (session.timeInZones![zone] ?? 0), 0),
  );
  const all = totals.reduce((sum, minutes) => sum + minutes, 0);
  if (all <= 0) {
    return null;
  }
  return {
    easy: (totals[0]! + totals[1]!) / all,
    middle: totals[2]! / all,
    hard: (totals[3]! + totals[4]!) / all,
    measuredSessions: measured.length,
  };
}

function longSessionDrift(
  sessions: readonly ExecutionSession[],
): SportExecutionDigest['longSessionDrift'] {
  const drifts = sessions
    .filter((session) => session.durationSec >= LONG_SESSION_SEC)
    .flatMap((session) => (session.hrDriftPercent === null ? [] : [session.hrDriftPercent]));
  const medianPercent = median(drifts);
  return medianPercent === null
    ? null
    : { medianPercent: round1(medianPercent), sessions: drifts.length };
}

function digestSport(sport: string, sessions: readonly ExecutionSession[]): SportExecutionDigest {
  const zones = zoneShares(sessions);
  const hard = sessions.filter((session) => hardMinutes(session) >= HARD_SESSION_MINUTES);
  return {
    sport,
    sessions: sessions.length,
    hours: round1(sessions.reduce((sum, session) => sum + session.durationSec, 0) / 3600),
    zones,
    hardSessions: hard.length,
    lastHardDay:
      hard
        .map((session) => session.day)
        .sort()
        .at(-1) ?? null,
    longSessionDrift: longSessionDrift(sessions),
  };
}

/**
 * One recording per outing. An activity seen by several sources leaves one session each, with
 * the same sport, day and length: keep the one that carries zone times.
 * shortcut: matches on five-minute length buckets; use the activity id once the feature set
 * carries it.
 */
function withoutDuplicates(sessions: readonly ExecutionSession[]): ExecutionSession[] {
  const kept = new Map<string, ExecutionSession>();
  for (const session of sessions) {
    const key = `${session.sport}|${session.day}|${Math.round(session.durationSec / 300)}`;
    const existing = kept.get(key);
    if (!existing || (!existing.timeInZones && session.timeInZones)) {
      kept.set(key, session);
    }
  }
  return [...kept.values()];
}

/** One digest per endurance sport with enough sessions in the window; others are left out. */
export function buildExecutionDigest(
  sessions: readonly ExecutionSession[],
  now: Date,
): SportExecutionDigest[] {
  const since = new Date(now.getTime() - EXECUTION_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const inWindow = withoutDuplicates(
    sessions.filter((session) => session.day >= since && session.durationSec > 0),
  );
  return DIGEST_SPORTS.flatMap((sport) => {
    const ofSport = inWindow.filter((session) => session.sport === sport);
    return ofSport.length >= MIN_SAMPLE ? [digestSport(sport, ofSport)] : [];
  });
}
