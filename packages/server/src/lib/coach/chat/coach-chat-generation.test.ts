import { describe, expect, it } from 'vitest';
import { coachChatGenerationSettings } from '@sharpit/server/lib/coach/chat/coach-chat-generation';
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
      'createBrickSession',
      'createPlannedSession',
      'deletePlannedSession',
      'logFoods',
      'setTrainingConstraint',
      'setTravelContext',
      'updatePlannedSession',
    ]);
  });
});
