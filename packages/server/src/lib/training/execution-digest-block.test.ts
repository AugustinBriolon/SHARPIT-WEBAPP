import { describe, expect, it, vi } from 'vitest';
import type { SportExecutionDigest } from '@sharpit/app/lib/training/execution-digest';

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));
vi.mock('@sharpit/server/infrastructure/features/prisma-feature-repository', () => ({
  PrismaFeatureRepository: class {},
}));

import { formatExecutionDigestBlock } from './execution-digest-block';

const digest = (overrides: Partial<SportExecutionDigest> = {}): SportExecutionDigest => ({
  sport: 'RUN',
  sessions: 28,
  hours: 23.4,
  zones: { easy: 0.92, middle: 0.06, hard: 0.02, measuredSessions: 24 },
  hardSessions: 0,
  lastHardDay: null,
  longSessionDrift: null,
  ...overrides,
});

describe('formatExecutionDigestBlock', () => {
  it('writes nothing when no sport was measured', () => {
    expect(formatExecutionDigestBlock([])).toBe('');
  });

  it('states where the time went and that no session was hard', () => {
    const block = formatExecutionDigestBlock([digest()]);

    expect(block).toContain('## Ce que les 8 dernières semaines ont mesuré');
    expect(block).toContain('- Course : 28 séances, 23,4 h.');
    expect(block).toContain(
      '92 % facile, 6 % tempo, 2 % au seuil et au-dessus (24 séances mesurées)',
    );
    expect(block).toContain('Aucune séance avec 8 min ou plus au seuil et au-dessus.');
  });

  it('dates the last hard session', () => {
    const block = formatExecutionDigestBlock([
      digest({ hardSessions: 2, lastHardDay: '2026-11-03' }),
    ]);
    expect(block).toContain(
      '2 séance(s) avec 8 min ou plus au seuil et au-dessus, la dernière le 3 novembre.',
    );
  });

  it('flags a high drift, and leaves a normal one unflagged', () => {
    const high = formatExecutionDigestBlock([
      digest({ sport: 'BIKE', longSessionDrift: { medianPercent: 9.6, sessions: 33 } }),
    ]);
    const normal = formatExecutionDigestBlock([
      digest({ longSessionDrift: { medianPercent: 1.6, sessions: 8 } }),
    ]);

    expect(high).toContain('- Vélo :');
    expect(high).toContain('9,6 % (33 sorties) — élevée.');
    expect(normal).toContain('1,6 % (8 sorties).');
  });

  it('says so when a sport has no measured zone time', () => {
    const block = formatExecutionDigestBlock([digest({ sport: 'SWIM', zones: null })]);
    expect(block).toContain(
      '- Natation : 28 séances, 23,4 h. Aucune séance avec temps en zone mesuré.',
    );
    // Unknown is not zero: no claim about hard sessions without zone times.
    expect(block).not.toContain('Aucune séance avec 8 min');
  });
});
