import { describe, expect, it } from 'vitest';
import { ActivityType, SessionIntensity } from '@prisma/client';
import {
  overlayDemoLinkOnPlannedSession,
  resolveDemoLinkedPlannedSessionForActivity,
} from '@sharpit/app/lib/demo/demo-session-link-overlay';
import type { ClientActivity, ClientPlannedSession } from '@sharpit/app/lib/query/types';

const LINKS = [
  {
    plannedSessionId: 'ps-demo',
    activityId: 'act-demo',
    planned: {
      title: 'Footing récup — démo liaison',
      type: ActivityType.RUN,
      date: '2026-07-03T00:00:00.000Z',
      durationMin: 40,
      intensity: SessionIntensity.ENDURANCE,
      description: null,
    },
  },
];

describe('demo-session-link-overlay', () => {
  it('overlays planned session summary on activity detail when demo-linked', () => {
    const summary = resolveDemoLinkedPlannedSessionForActivity('act-demo', null, [], LINKS);

    expect(summary?.id).toBe('ps-demo');
    expect(summary?.title).toBe('Footing récup — démo liaison');
  });

  it('prefers server-side planned session over demo overlay', () => {
    const server = {
      id: 'ps-server',
      title: 'Plan réel',
      date: new Date('2026-07-03'),
      type: ActivityType.RUN,
      durationMin: 50,
      description: null,
      intensity: SessionIntensity.ENDURANCE,
      analysis: null,
      analyzedAt: null,
      brickGroupId: null,
      brickOrder: null,
      goal: null,
    };

    const summary = resolveDemoLinkedPlannedSessionForActivity('act-demo', server, [], LINKS);
    expect(summary?.id).toBe('ps-server');
  });

  it('marks planned session as linked in demo modal state', () => {
    const session = {
      id: 'ps-demo',
      title: 'Footing récup — démo liaison',
      type: ActivityType.RUN,
      date: new Date('2026-07-03'),
      durationMin: 40,
      activityId: null,
      completed: false,
    } as ClientPlannedSession;

    const activity = {
      id: 'act-demo',
      title: 'Footing récup — démo liaison (réalisé)',
      type: ActivityType.RUN,
      date: new Date('2026-07-03T18:00:00'),
      duration: 2400,
    } as ClientActivity;

    const patched = overlayDemoLinkOnPlannedSession(session, [activity], LINKS);

    expect(patched.activityId).toBe('act-demo');
    expect(patched.completed).toBe(true);
    expect(patched.activity?.title).toBe('Footing récup — démo liaison (réalisé)');
  });
});
