import { describe, expect, it } from 'vitest';
import { buildExecutionDigest, type ExecutionSession } from './execution-digest';

const NOW = new Date('2026-11-15T08:00:00.000Z');

const session = (overrides: Partial<ExecutionSession> = {}): ExecutionSession => ({
  sport: 'RUN',
  day: '2026-11-10',
  durationSec: 3600,
  timeInZones: [20, 40, 0, 0, 0],
  hrDriftPercent: null,
  ...overrides,
});

const digestOf = (sessions: ExecutionSession[], sport = 'RUN') =>
  buildExecutionDigest(sessions, NOW).find((digest) => digest.sport === sport);

describe('buildExecutionDigest', () => {
  it('shares the measured time between easy, middle and hard zones', () => {
    const digest = digestOf([
      session({ day: '2026-11-01', timeInZones: [30, 30, 0, 0, 0] }),
      session({ day: '2026-11-05', timeInZones: [10, 20, 20, 5, 5] }),
      session({ day: '2026-11-09', timeInZones: null }),
    ]);

    expect(digest).toMatchObject({ sessions: 3, hours: 3 });
    expect(digest?.zones).toEqual({ easy: 0.75, middle: 1 / 6, hard: 1 / 12, measuredSessions: 2 });
  });

  it('counts a session as hard from eight minutes at the threshold and above', () => {
    const digest = digestOf([
      session({ day: '2026-10-20', timeInZones: [20, 20, 10, 6, 2] }),
      session({ day: '2026-11-03', timeInZones: [20, 20, 10, 9, 0] }),
      session({ day: '2026-11-12', timeInZones: [20, 30, 3, 7, 0] }),
    ]);

    expect(digest).toMatchObject({ hardSessions: 2, lastHardDay: '2026-11-03' });
  });

  it('reports no hard session when none reached eight minutes', () => {
    const digest = digestOf(
      ['2026-11-01', '2026-11-05', '2026-11-09'].map((day) => session({ day })),
    );
    expect(digest).toMatchObject({ hardSessions: 0, lastHardDay: null });
  });

  it('reads the drift on sessions of an hour and more, and needs three of them', () => {
    const long = (day: string, hrDriftPercent: number) =>
      session({ day, durationSec: 4200, hrDriftPercent });
    const short = session({ day: '2026-11-12', durationSec: 1800, hrDriftPercent: 30 });
    const three = [long('2026-11-01', 4), long('2026-11-05', 9), long('2026-11-09', 11)];

    expect(digestOf([...three, short])?.longSessionDrift).toEqual({
      medianPercent: 9,
      sessions: 3,
    });
    expect(digestOf([three[0]!, three[1]!, short])?.longSessionDrift).toBeNull();
  });

  // An activity seen by Garmin, Apple Health and Strava left three sessions for one outing.
  it('counts an outing recorded by several sources once, keeping the measured one', () => {
    const digest = digestOf([
      session({ day: '2026-10-25', durationSec: 3600, timeInZones: null }),
      session({ day: '2026-10-25', durationSec: 3620, timeInZones: [20, 30, 0, 10, 0] }),
      session({ day: '2026-10-25', durationSec: 3590, timeInZones: [20, 30, 0, 10, 0] }),
      session({ day: '2026-10-25', durationSec: 1500 }),
      session({ day: '2026-11-01' }),
    ]);

    expect(digest).toMatchObject({ sessions: 3, hardSessions: 1, lastHardDay: '2026-10-25' });
    expect(digest?.zones?.measuredSessions).toBe(3);
  });

  it('leaves out sessions older than eight weeks, other sports and thin samples', () => {
    const digests = buildExecutionDigest(
      [
        session({ day: '2026-09-01' }),
        session({ day: '2026-11-01' }),
        session({ day: '2026-11-05' }),
        ...['2026-11-01', '2026-11-05', '2026-11-09'].flatMap((day) => [
          session({ day, sport: 'STRENGTH' }),
          session({ day, sport: 'BIKE' }),
        ]),
      ],
      NOW,
    );

    expect(digests.map((digest) => [digest.sport, digest.sessions])).toEqual([['BIKE', 3]]);
  });
});
