import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_STATUS_DEFAULT,
  ACTIVITY_STATUS_IDS,
  activityStatusDraftMatchesStore,
  activityStatusLabel,
  activityStatusWriteFromDraft,
  isActivityStatus,
  isSettledTrainingDay,
  parseActivityStatusStore,
  resolveActivityStatusStore,
} from './activity-status';

describe('activity-status', () => {
  it('defaults to actif', () => {
    expect(ACTIVITY_STATUS_DEFAULT).toBe('active');
    expect(activityStatusLabel('active')).toBe('Actif');
    expect(ACTIVITY_STATUS_IDS).toEqual(['active', 'paused', 'injured', 'sick']);
  });

  it('accepts known statuses only (no vacation)', () => {
    expect(isActivityStatus('active')).toBe(true);
    expect(isActivityStatus('paused')).toBe(true);
    expect(isActivityStatus('injured')).toBe(true);
    expect(isActivityStatus('sick')).toBe(true);
    expect(isActivityStatus('vacation')).toBe(false);
  });

  it('parses store, migrates vacation → paused, and falls back to actif', () => {
    expect(parseActivityStatusStore(null).status).toBe('active');
    expect(parseActivityStatusStore({ version: 1, status: 'injured' }).status).toBe('injured');
    expect(parseActivityStatusStore({ version: 1, status: 'vacation' }).status).toBe('paused');
    expect(parseActivityStatusStore({ version: 1, status: 'nope' }).status).toBe('active');
    expect(
      parseActivityStatusStore({
        version: 2,
        status: 'sick',
        retention: { kind: 'until_date', untilDate: '2026-09-20' },
        travelId: null,
      }).retention,
    ).toEqual({ kind: 'until_date', untilDate: '2026-09-20' });
  });

  it('resolves expired until_date back to actif', () => {
    const expired = resolveActivityStatusStore(
      {
        version: 2,
        status: 'paused',
        retention: { kind: 'until_date', untilDate: '2026-09-01' },
        travelId: 'travel-1',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      '2026-09-08',
    );
    expect(expired.status).toBe('active');
    expect(expired.travelId).toBeNull();
  });

  it('builds write payload from draft and matches store without false dirty', () => {
    const store = {
      version: 2 as const,
      status: 'injured' as const,
      retention: { kind: 'until_date' as const, untilDate: '2026-09-20' },
      travelId: null,
      updatedAt: '2026-09-10T00:00:00.000Z',
    };
    const matching = {
      status: 'injured' as const,
      retentionKind: 'until_date' as const,
      untilDate: '2026-09-20',
      travelId: null,
    };
    expect(activityStatusDraftMatchesStore(store, matching)).toBe(true);
    expect(activityStatusWriteFromDraft(matching)).toEqual({
      status: 'injured',
      retention: { kind: 'until_date', untilDate: '2026-09-20' },
      travelId: null,
    });
    expect(
      activityStatusDraftMatchesStore(store, {
        ...matching,
        untilDate: '2026-09-21',
      }),
    ).toBe(false);
    expect(
      activityStatusWriteFromDraft({
        status: 'active',
        retentionKind: 'until_modified',
        untilDate: '2026-09-20',
        travelId: null,
      }),
    ).toEqual({
      status: 'active',
    });
  });
});

describe('isSettledTrainingDay', () => {
  const now = new Date('2026-10-23T08:00:00.000Z');

  it('settles days older than yesterday', () => {
    expect(isSettledTrainingDay('2026-10-21', now)).toBe(true);
    expect(isSettledTrainingDay('2026-05-02', now)).toBe(true);
  });

  it('keeps yesterday, today and tomorrow live', () => {
    expect(isSettledTrainingDay('2026-10-22', now)).toBe(false);
    expect(isSettledTrainingDay('2026-10-23', now)).toBe(false);
    expect(isSettledTrainingDay('2026-10-24', now)).toBe(false);
  });
});
