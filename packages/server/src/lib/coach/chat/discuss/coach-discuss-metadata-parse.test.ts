import { describe, expect, it } from 'vitest';
import {
  coachDiscussMetadata,
  describeCoachDiscussContext,
} from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-context';
import type { CoachDiscussTarget } from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-href';
import {
  lastCoachDiscussMetadata,
  parseCoachDiscussMetadata,
} from '@sharpit/server/lib/coach/chat/discuss/coach-discuss-metadata-parse';

const EVERY_TARGET: CoachDiscussTarget[] = [
  { kind: 'today' },
  { kind: 'morning-brief', trainingDayId: '2026-10-12' },
  { kind: 'planned-session', sessionId: 'cmsession01' },
  { kind: 'activity', activityId: 'cmactivity01' },
  { kind: 'planning', horizonDays: 14 },
  { kind: 'goal', goalId: 'cmgoal01' },
  { kind: 'record', categoryKey: 'run-distance' },
  { kind: 'physical-condition', noteId: 'cmnote01' },
  { kind: 'journal-analyses' },
  { kind: 'nutrition', trainingDayId: '2026-10-01' },
];

function userMessage(metadata?: unknown) {
  return { role: 'user', parts: [], ...(metadata === undefined ? {} : { metadata }) };
}

describe('parseCoachDiscussMetadata', () => {
  it.each(EVERY_TARGET)('reads back what the client sends for $kind', (target) => {
    const sent = coachDiscussMetadata(describeCoachDiscussContext(target));

    expect(parseCoachDiscussMetadata(JSON.parse(JSON.stringify(sent)))).toEqual(sent);
  });

  it('drops fields that do not belong to the kind', () => {
    expect(
      parseCoachDiscussMetadata({ discussKind: 'goal', goalId: 'g-1', athleteId: 'someone-else' }),
    ).toEqual({ discussKind: 'goal', goalId: 'g-1' });
  });

  it.each([
    ['a non-object', 'goal'],
    ['null', null],
    ['an array', [{ discussKind: 'today' }]],
    ['an unknown kind', { discussKind: 'sleep' }],
    [
      'a morning-brief day that is not a date',
      { discussKind: 'morning-brief', trainingDayId: 'today' },
    ],
    ['a nutrition day that is not a date', { discussKind: 'nutrition', trainingDayId: 'today' }],
    ['an inherited property name', { discussKind: 'toString' }],
    ['a missing id', { discussKind: 'goal' }],
    ['a numeric id', { discussKind: 'activity', activityId: 42 }],
    ['an empty id', { discussKind: 'planned-session', sessionId: '' }],
    ['an id with path characters', { discussKind: 'goal', goalId: '../admin' }],
    ['an id with spaces', { discussKind: 'physical-condition', noteId: 'a b' }],
    ['an oversized id', { discussKind: 'record', categoryKey: 'x'.repeat(129) }],
    ['an unsupported horizon', { discussKind: 'planning', horizonDays: 5 }],
    ['a stringly horizon', { discussKind: 'planning', horizonDays: '7' }],
  ])('ignores %s', (_label, value) => {
    expect(parseCoachDiscussMetadata(value)).toBeNull();
  });
});

describe('lastCoachDiscussMetadata', () => {
  it('uses the most recent user message that carries a discuss context', () => {
    expect(
      lastCoachDiscussMetadata([
        userMessage({ discussKind: 'journal-analyses' }),
        userMessage(),
        userMessage({ discussKind: 'goal', goalId: 'g-1' }),
        userMessage(),
      ]),
    ).toEqual({ discussKind: 'goal', goalId: 'g-1' });
  });

  it('keeps an earlier context across later plain turns', () => {
    expect(
      lastCoachDiscussMetadata([
        userMessage({ discussKind: 'activity', activityId: 'a-1' }),
        { role: 'assistant', parts: [] },
        userMessage(),
      ]),
    ).toEqual({ discussKind: 'activity', activityId: 'a-1' });
  });

  it('ignores assistant metadata and malformed messages', () => {
    expect(
      lastCoachDiscussMetadata([
        null,
        'hello',
        { role: 'assistant', parts: [], metadata: { discussKind: 'today' } },
        userMessage('journal-analyses'),
      ]),
    ).toBeNull();
  });

  it('applies nothing when the latest discuss metadata is malformed', () => {
    expect(
      lastCoachDiscussMetadata([
        userMessage({ discussKind: 'today' }),
        userMessage({ discussKind: 'goal', goalId: { $ne: null } }),
      ]),
    ).toBeNull();
  });

  it('rejects bodies that are not message lists', () => {
    expect(lastCoachDiscussMetadata(undefined)).toBeNull();
    expect(lastCoachDiscussMetadata({ messages: [] })).toBeNull();
  });
});
