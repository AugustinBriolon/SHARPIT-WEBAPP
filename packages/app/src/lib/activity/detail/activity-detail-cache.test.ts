import { describe, expect, it } from 'vitest';
import { ActivityType } from '@prisma/client';
import {
  activityDetailToHeaderActivity,
  clientActivityToDetailShell,
  clientActivityToHeaderActivity,
} from '@sharpit/app/lib/activity/detail/activity-detail-cache';
import type { ClientActivity } from '@sharpit/app/lib/query/types';

function sampleActivity(partial: Partial<ClientActivity> & { id: string }): ClientActivity {
  return {
    type: ActivityType.RUN,
    date: new Date('2026-08-20'),
    title: 'Sortie footing',
    duration: 3600,
    load: 85,
    rpe: 6,
    feeling: 'Bien',
    weather: null,
    notes: null,
    source: 'garmin',
    stravaId: null,
    garminId: 'g1',
    createdAt: new Date(),
    updatedAt: new Date(),
    runMetrics: { distanceM: 10000 },
    bikeMetrics: null,
    swimMetrics: null,
    hikeMetrics: null,
    strengthSets: [],
    plannedSession: null,
    multisportLegs: null,
    ...partial,
  } as ClientActivity;
}

describe('activity-detail-cache', () => {
  it('maps list cache row to header activity', () => {
    const cached = sampleActivity({ id: 'a1' });
    const header = clientActivityToHeaderActivity(cached);
    expect(header.id).toBe('a1');
    expect(header.title).toBe('Sortie footing');
  });

  it('maps list cache row to detail shell for meta/hero', () => {
    const cached = sampleActivity({ id: 'a2', feeling: 'Correct' });
    const shell = clientActivityToDetailShell(cached);
    expect(shell.feeling).toBe('Correct');
    expect(shell.type).toBe(ActivityType.RUN);
  });

  it('maps full detail row to header activity', () => {
    const cached = sampleActivity({ id: 'a3' });
    const detail = clientActivityToDetailShell(cached);
    const header = activityDetailToHeaderActivity(detail);
    expect(header.id).toBe('a3');
    expect(header.title).toBe('Sortie footing');
  });
});
