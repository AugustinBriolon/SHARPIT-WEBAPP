import { describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));
vi.mock('@sharpit/server/lib/queries', () => ({ getAthleteProfile: vi.fn() }));
vi.mock('@sharpit/server/lib/training/records/records', () => ({
  getStoredRecords: vi.fn(),
  resample1Hz: vi.fn(),
}));

import { formatFtpConfidenceBlock } from './ftp-confidence';

const evidence = { watts: 183, seconds: 1200, date: '2026-09-03T17:00:00.000Z', avgHr: 140 };

describe('formatFtpConfidenceBlock', () => {
  it('writes nothing when no effort backs the threshold', () => {
    expect(formatFtpConfidenceBlock({ level: 'none' })).toBe('');
  });

  it('calls an unverified threshold a floor and asks for one test', () => {
    const block = formatFtpConfidenceBlock({ level: 'floor', evidence, bikeLthr: null });
    expect(block).toContain('183 W sur 20 min le 3 septembre à 140 bpm de moyenne');
    expect(block).toContain('plancher');
    expect(block).toContain('UNE séance de qualité vélo par un test');
  });

  it('gives the observed bike threshold heart rate of a verified effort', () => {
    const block = formatFtpConfidenceBlock({
      level: 'verified',
      evidence: { ...evidence, avgHr: 170 },
      bikeLthr: 165,
    });
    expect(block).toContain('effort proche du maximum');
    expect(block).toContain('FC seuil vélo observée ≈ 165 bpm');
    expect(block).not.toContain('test');
  });

  it('leaves the heart rate out when the recording had none', () => {
    const block = formatFtpConfidenceBlock({
      level: 'floor',
      evidence: { ...evidence, avgHr: null },
      bikeLthr: null,
    });
    expect(block).toContain('183 W sur 20 min le 3 septembre)');
    expect(block).toContain('rien ne montre');
    expect(block).not.toContain("n'était pas un effort maximal");
  });
});
