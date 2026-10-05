import { describe, expect, it } from 'vitest';
import {
  recurrenceCount,
  resolutionSuggested,
  statusChangeLabel,
  zoneStrategy,
  type FollowedZone,
} from './zone-follow-up';

const NOW = new Date('2026-10-05T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const PAIN: FollowedZone = {
  category: 'PAIN',
  status: 'ACTIVE',
  severity: 4,
  functionalImpact: null,
  affectsTraining: true,
  resolvedAt: null,
};

describe('zoneStrategy', () => {
  it('protects an open pain that still hurts, or anything limiting', () => {
    expect(zoneStrategy(PAIN, NOW)).toBe('protect');
    expect(zoneStrategy({ ...PAIN, status: 'MONITORING', severity: 6 }, NOW)).toBe('protect');
    expect(
      zoneStrategy(
        { ...PAIN, status: 'MONITORING', severity: 1, functionalImpact: 'LIMITING' },
        NOW,
      ),
    ).toBe('protect');
  });

  it('loads progressively a zone under watch, or open but silent', () => {
    expect(zoneStrategy({ ...PAIN, status: 'MONITORING', severity: 2 }, NOW)).toBe('progressive');
    expect(zoneStrategy({ ...PAIN, severity: 0 }, NOW)).toBe('progressive');
    expect(zoneStrategy({ ...PAIN, severity: 3, functionalImpact: 'NONE' }, NOW)).toBe(
      'progressive',
    );
  });

  it('turns posture and mobility into targets', () => {
    expect(zoneStrategy({ ...PAIN, category: 'POSTURE', severity: 5 }, NOW)).toBe('correct');
    expect(zoneStrategy({ ...PAIN, category: 'MOBILITY' }, NOW)).toBe('correct');
  });

  it('watches a pain resolved less than six weeks ago, then forgets it', () => {
    const resolved = { ...PAIN, status: 'RESOLVED' };
    expect(zoneStrategy({ ...resolved, resolvedAt: daysAgo(10) }, NOW)).toBe('relapse_watch');
    expect(zoneStrategy({ ...resolved, resolvedAt: daysAgo(60) }, NOW)).toBe('none');
    expect(zoneStrategy({ ...resolved, category: 'POSTURE', resolvedAt: daysAgo(5) }, NOW)).toBe(
      'none',
    );
  });

  it('ignores a zone the athlete keeps out of training', () => {
    expect(zoneStrategy({ ...PAIN, affectsTraining: false }, NOW)).toBe('none');
  });
});

describe('resolutionSuggested', () => {
  const zeros = (...days: number[]) => days.map((day) => ({ date: daysAgo(day), severity: 0 }));

  it('asks once two weeks of readings all say 0/10', () => {
    expect(resolutionSuggested({ ...PAIN, checkins: zeros(1, 8, 15) }, NOW)).toBe(true);
  });

  it('waits while the quiet run is short, recent or broken', () => {
    expect(resolutionSuggested({ ...PAIN, checkins: zeros(20) }, NOW)).toBe(false);
    expect(resolutionSuggested({ ...PAIN, checkins: zeros(1, 6) }, NOW)).toBe(false);
    expect(
      resolutionSuggested(
        { ...PAIN, checkins: [...zeros(1, 5), { date: daysAgo(9), severity: 2 }, ...zeros(20)] },
        NOW,
      ),
    ).toBe(false);
  });

  it('skips status changes without a reading, and never asks for a resolved zone', () => {
    const checkins = [...zeros(1, 16), { date: daysAgo(3), severity: null, status: 'MONITORING' }];
    expect(resolutionSuggested({ ...PAIN, checkins }, NOW)).toBe(true);
    expect(resolutionSuggested({ ...PAIN, status: 'RESOLVED', checkins }, NOW)).toBe(false);
  });
});

describe('recurrence', () => {
  it('counts each reopening of a resolved zone', () => {
    const change = (day: number, status: string) => ({
      date: daysAgo(day),
      severity: null,
      status,
    });
    expect(
      recurrenceCount([
        change(40, 'RESOLVED'),
        change(30, 'ACTIVE'),
        change(20, 'MONITORING'),
        change(15, 'ACTIVE'),
        change(10, 'RESOLVED'),
        change(2, 'ACTIVE'),
        { date: daysAgo(1), severity: 3 },
      ]),
    ).toBe(2);
  });

  it('names a reopening after resolution a relapse', () => {
    expect(statusChangeLabel('ACTIVE', 'RESOLVED')).toBe('Rechute');
    expect(statusChangeLabel('ACTIVE', 'MONITORING')).toBe('Remise en cours');
    expect(statusChangeLabel('RESOLVED', 'ACTIVE')).toBe('Résolue');
  });
});
