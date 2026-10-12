import { describe, expect, it } from 'vitest';
import { coachDiscussHref } from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-href';
import {
  coachDiscussMetadata,
  describeCoachDiscussContext,
  enrichDiscussContextWithActivityStatus,
} from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-context';

describe('coachDiscussHref', () => {
  it('builds a link for every athlete surface the IA names', () => {
    expect(coachDiscussHref({ kind: 'today' })).toBe('/coach?discussToday=1');
    expect(coachDiscussHref({ kind: 'goal', goalId: 'g-1' })).toBe('/coach?discussGoal=g-1');
    expect(coachDiscussHref({ kind: 'record', categoryKey: 'run-5k' })).toBe(
      '/coach?discussRecord=run-5k',
    );
    expect(coachDiscussHref({ kind: 'physical-condition', noteId: 'n-1' })).toBe(
      '/coach?discussCondition=n-1',
    );
  });

  it('encodes ids that would otherwise break the query string', () => {
    expect(coachDiscussHref({ kind: 'goal', goalId: 'a b&c' })).toBe(
      '/coach?discussGoal=a%20b%26c',
    );
  });
});

describe('describeCoachDiscussContext', () => {
  it('names the attachment in plain language', () => {
    expect(describeCoachDiscussContext({ kind: 'today' }).label).toBe('Ton état du jour');
    expect(
      describeCoachDiscussContext({ kind: 'morning-brief', trainingDayId: '2026-10-12' }).label,
    ).toBe('Brief du matin');
    expect(describeCoachDiscussContext({ kind: 'goal', goalId: 'g' }, 'Half IronMan').label).toBe(
      'Objectif · Half IronMan',
    );
    expect(describeCoachDiscussContext({ kind: 'planning', horizonDays: 7 }).label).toBe(
      'Ta semaine · les 7 prochains jours',
    );
  });

  it('degrades to the kind rather than inventing a name', () => {
    expect(describeCoachDiscussContext({ kind: 'goal', goalId: 'g' }).label).toBe('Un objectif');
    expect(describeCoachDiscussContext({ kind: 'goal', goalId: 'g' }, '   ').label).toBe(
      'Un objectif',
    );
  });

  it('points back at the surface the context came from', () => {
    expect(describeCoachDiscussContext({ kind: 'activity', activityId: 'a-1' }).sourceHref).toBe(
      '/activite/a-1',
    );
    expect(describeCoachDiscussContext({ kind: 'record', categoryKey: 'k' }).sourceHref).toBe(
      '/moi/performance',
    );
  });

  it('enriches today and planning chips with non-active activity status', () => {
    const today = describeCoachDiscussContext({ kind: 'today' });
    expect(enrichDiscussContextWithActivityStatus(today, 'active').label).toBe('Ton état du jour');
    expect(enrichDiscussContextWithActivityStatus(today, 'paused').label).toBe(
      'Ton état du jour · En pause',
    );
    expect(enrichDiscussContextWithActivityStatus(today, 'sick').label).toBe(
      'Ton état du jour · Malade',
    );
    const planning = describeCoachDiscussContext({ kind: 'planning', horizonDays: 7 });
    expect(enrichDiscussContextWithActivityStatus(planning, 'injured').label).toBe(
      'Ta semaine · les 7 prochains jours · Blessé',
    );
  });
});

describe('coachDiscussMetadata', () => {
  it.each([
    [{ kind: 'today' }, { discussKind: 'today' }],
    [
      { kind: 'morning-brief', trainingDayId: '2026-10-12' },
      { discussKind: 'morning-brief', trainingDayId: '2026-10-12' },
    ],
    [
      { kind: 'planned-session', sessionId: 's-1' },
      { discussKind: 'planned-session', sessionId: 's-1' },
    ],
    [
      { kind: 'activity', activityId: 'a-1' },
      { discussKind: 'activity', activityId: 'a-1' },
    ],
    [
      { kind: 'planning', horizonDays: 14 },
      { discussKind: 'planning', horizonDays: 14 },
    ],
    [
      { kind: 'goal', goalId: 'g-1' },
      { discussKind: 'goal', goalId: 'g-1' },
    ],
    [
      { kind: 'record', categoryKey: 'run-pace' },
      { discussKind: 'record', categoryKey: 'run-pace' },
    ],
    [
      { kind: 'physical-condition', noteId: 'n-1' },
      { discussKind: 'physical-condition', noteId: 'n-1' },
    ],
    [{ kind: 'journal-analyses' }, { discussKind: 'journal-analyses' }],
  ] as const)('carries the target of %o', (target, expected) => {
    expect(coachDiscussMetadata(describeCoachDiscussContext(target, 'Nom'))).toEqual(expected);
  });

  it('keeps the target when a chip label is enriched', () => {
    const planning = enrichDiscussContextWithActivityStatus(
      describeCoachDiscussContext({ kind: 'planning', horizonDays: 7 }),
      'injured',
    );

    expect(coachDiscussMetadata(planning)).toEqual({ discussKind: 'planning', horizonDays: 7 });
  });
});
