import { describe, expect, it } from 'vitest';
import {
  classifyCoachIntent,
  coachRequestScope,
  isPlanningThread,
  lastUserText,
} from '@sharpit/server/lib/coach/chat/coach-request-scope';

const classify = (
  lastUserText: string,
  extra: { discussKind?: string; isPlanningThread?: boolean } = {},
) => classifyCoachIntent({ lastUserText, ...extra });

describe('classifyCoachIntent', () => {
  it('routes calendar requests to planning, accents or not', () => {
    expect(classify('Tu peux déplacer ma séance de demain à jeudi ?')).toBe('planning');
    expect(classify('planifie ma semaine prochaine')).toBe('planning');
    expect(classify('Ajoute un footing samedi')).toBe('planning');
  });

  it('reads nutrition, recovery and session questions', () => {
    expect(classify('Est-ce que je mange assez de glucides ?')).toBe('nutrition');
    expect(classify("J'ai mal dormi, je fais quoi ?")).toBe('recovery');
    expect(classify('Analyse ma sortie de ce matin')).toBe('session');
  });

  it('answers general when nothing is clear', () => {
    expect(classify('Salut coach')).toBe('general');
  });

  it('lets the screen decide over a vague question', () => {
    expect(classify("Qu'en penses-tu ?", { discussKind: 'activity' })).toBe('session');
    expect(classify("Qu'en penses-tu ?", { discussKind: 'planned-session' })).toBe('planning');
  });

  it('scopes a conversation opened from Nutrition on nutrition', () => {
    expect(classify("Qu'en penses-tu ?", { discussKind: 'nutrition' })).toBe('nutrition');
  });

  it('keeps a follow-up in planning while the thread proposes calendar changes', () => {
    expect(classify('et jeudi ?', { isPlanningThread: true })).toBe('planning');
  });

  it('never trims planning, even from a nutrition screen', () => {
    expect(
      classify('Déplace ma séance pour manger avant', { discussKind: 'journal-analyses' }),
    ).toBe('planning');
  });
});

describe('coachRequestScope', () => {
  it('gives planning everything, the agenda included', () => {
    expect(coachRequestScope('planning')).toMatchObject({
      sections: null,
      tools: null,
      readsAgenda: true,
      reasoning: 'low',
    });
  });

  it('keeps the whole context and every tool for a general question, without the agenda', () => {
    expect(coachRequestScope('general')).toMatchObject({
      sections: null,
      tools: null,
      readsAgenda: false,
      reasoning: 'minimal',
    });
  });

  it('sends a nutrition question its core, logFoods, and no calendar-writing tool', () => {
    const scope = coachRequestScope('nutrition');
    expect(scope.sections?.has('goals')).toBe(true);
    expect(scope.sections?.has('physical')).toBe(true);
    expect(scope.sections?.has('activityStatus')).toBe(true);
    expect(scope.sections?.has('equipment')).toBe(false);
    expect(scope.tools).toContain('logFoods');
    expect(scope.tools).not.toContain('createPlannedSession');
    expect(scope.readsAgenda).toBe(false);
  });
});

describe('message readers', () => {
  const messages = [
    { role: 'user', parts: [{ type: 'text', text: 'Planifie ma semaine' }] },
    {
      role: 'assistant',
      parts: [{ type: 'tool-createPlannedSession', state: 'approval-requested' }],
    },
    { role: 'user', parts: [{ type: 'text', text: 'et jeudi ?' }] },
  ];

  it('reads the latest question', () => {
    expect(lastUserText(messages)).toBe('et jeudi ?');
    expect(lastUserText(null)).toBe('');
  });

  it('sees calendar proposals in the recent turns', () => {
    expect(isPlanningThread(messages)).toBe(true);
    expect(isPlanningThread([messages[0]])).toBe(false);
  });
});
