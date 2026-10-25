import { describe, expect, it } from 'vitest';
import {
  coachChatGenerationSettings,
  drewCoachCard,
} from '@sharpit/server/lib/coach/chat/coach-chat-generation';
import { coachRequestScope } from '@sharpit/server/lib/coach/chat/coach-request-scope';

describe('coachChatGenerationSettings', () => {
  it('keeps every tool for a planning question', () => {
    const settings = coachChatGenerationSettings(coachRequestScope('planning'));
    expect(settings).not.toHaveProperty('activeTools');
    expect(settings.reasoning).toBe(coachRequestScope('planning').reasoning);
  });

  it('narrows the tools of a trimmed question to its scope', () => {
    const scope = coachRequestScope('nutrition');
    const settings = coachChatGenerationSettings(scope);
    expect(settings).toHaveProperty('activeTools', scope.tools);
    expect(settings.reasoning).toBe(scope.reasoning);
  });

  it('asks the athlete before any calendar, constraint or food-log write', () => {
    const { toolApproval } = coachChatGenerationSettings(coachRequestScope('general'));
    expect(Object.keys(toolApproval).sort()).toEqual([
      'archiveCoachMemoryNote',
      'createBrickSession',
      'createPlannedSession',
      'deletePlannedSession',
      'logFoods',
      'proposePlaybookAction',
      'setTrainingConstraint',
      'setTravelContext',
      'updatePlannedSession',
      'upsertCoachMemoryNote',
    ]);
  });
});

describe('drewCoachCard', () => {
  const stepWith = (toolName: string, output: unknown) =>
    ({ toolResults: [{ toolName, output }] }) as never;

  it('ends the turn once a display card is drawn', () => {
    expect(
      drewCoachCard({ steps: [stepWith('suggestFollowUps', { ok: true, schemaVersion: 1 })] }),
    ).toBe(true);
    expect(
      drewCoachCard({ steps: [stepWith('presentWorkout', { ok: true, schemaVersion: 1 })] }),
    ).toBe(true);
  });

  it('lets the model retry a refused card and goes on after any other tool', () => {
    expect(drewCoachCard({ steps: [stepWith('presentWorkout', { ok: false, error: 'x' })] })).toBe(
      false,
    );
    expect(drewCoachCard({ steps: [stepWith('listPlannedSessions', { ok: true })] })).toBe(false);
    expect(drewCoachCard({ steps: [] })).toBe(false);
  });
});
