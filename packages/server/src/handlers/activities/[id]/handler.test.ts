import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const queries = vi.hoisted(() => ({
  getActivityById: vi.fn(),
  getGoalById: vi.fn(),
  updateActivity: vi.fn(),
  deleteActivity: vi.fn(),
}));
const achievements = vi.hoisted(() => ({
  recordRaceResult: vi.fn(),
  clearRaceResult: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@sharpit/server/lib/queries', () => queries);
vi.mock('@sharpit/server/lib/goals/goal-achievements', () => achievements);
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));
vi.mock('@sharpit/server/lib/athlete-state/orchestrator', () => ({ onWellnessSubmitted: vi.fn() }));
vi.mock('@sharpit/server/lib/observation/manual-observation-sync', () => ({
  removeManualActivityObservations: vi.fn(),
  syncManualActivityObservations: vi.fn(),
}));
vi.mock('@sharpit/server/lib/training/records/records', () => ({
  updateRecordsForTypesSafe: vi.fn(),
}));

import { PATCH } from './handler';

const context = { params: Promise.resolve({ id: 'act-1' }) };
const activity = { id: 'act-1', type: 'TRIATHLON', goalId: null, duration: 8700, date: new Date() };
const goal = { id: 'goal-1', kind: 'RACE', athleteId: 'athlete-1' };

function patch(body: unknown) {
  return new NextRequest('http://localhost/api/v1/activities/act-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/v1/activities/[id] — goal link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.getActivityById.mockResolvedValue(activity);
    queries.updateActivity.mockResolvedValue({ ...activity, goalId: 'goal-1' });
  });

  it('refuses a goal the athlete does not own', async () => {
    queries.getGoalById.mockResolvedValue(null);

    const response = await PATCH(patch({ goalId: 'someone-elses-goal' }), context);

    expect(response.status).toBe(404);
    expect(queries.getGoalById).toHaveBeenCalledWith('athlete-1', 'someone-elses-goal');
    expect(queries.updateActivity).not.toHaveBeenCalled();
  });

  it('links an owned goal and records the race result', async () => {
    queries.getGoalById.mockResolvedValue(goal);

    const response = await PATCH(patch({ goalId: 'goal-1' }), context);

    expect(response.status).toBe(200);
    expect(queries.updateActivity).toHaveBeenCalledWith('athlete-1', 'act-1', {
      goal: { connect: { id: 'goal-1' } },
    });
    expect(achievements.recordRaceResult).toHaveBeenCalledWith(
      goal,
      expect.objectContaining({ id: 'act-1' }),
      'manual',
    );
  });

  it('unlinks with null and withdraws the previous result', async () => {
    queries.getActivityById.mockResolvedValue({ ...activity, goalId: 'goal-1' });

    const response = await PATCH(patch({ goalId: null }), context);

    expect(response.status).toBe(200);
    expect(queries.updateActivity).toHaveBeenCalledWith('athlete-1', 'act-1', {
      goal: { disconnect: true },
    });
    expect(achievements.clearRaceResult).toHaveBeenCalledWith('goal-1', 'act-1');
    expect(achievements.recordRaceResult).not.toHaveBeenCalled();
  });

  it('refuses to edit an absorbed multisport leg', async () => {
    queries.getActivityById.mockResolvedValue({ ...activity, mergedIntoId: 'tri-1' });

    const response = await PATCH(patch({ title: 'Natation' }), context);

    expect(response.status).toBe(404);
    expect(queries.updateActivity).not.toHaveBeenCalled();
  });

  it('answers with the saved link when the race result fails', async () => {
    queries.getGoalById.mockResolvedValue(goal);
    achievements.recordRaceResult.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await PATCH(patch({ goalId: 'goal-1' }), context);

    expect(response.status).toBe(200);
  });
});
