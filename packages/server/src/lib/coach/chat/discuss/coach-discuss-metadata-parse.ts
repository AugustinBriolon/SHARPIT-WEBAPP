/**
 * Server-side reading of the discuss metadata carried by user messages.
 * The request body is client-controlled: every field is shape-checked and any
 * unknown kind or malformed target yields `null` (an ordinary conversation).
 */

import type { CoachDiscussMetadata } from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-context';

type DiscussKind = CoachDiscussMetadata['discussKind'];
type RawObject = Record<string, unknown>;
type MetadataParser = (raw: RawObject) => CoachDiscussMetadata | null;

/** cuid ids and record keys (`run-distance`) — nothing else reaches a query. */
const TARGET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TRAINING_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PLANNING_HORIZONS: ReadonlySet<unknown> = new Set([1, 3, 7, 14]);

function isObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function targetIdParser(kind: DiscussKind, field: string): MetadataParser {
  return (raw) => {
    const id = raw[field];
    if (typeof id !== 'string' || !TARGET_ID_PATTERN.test(id)) {
      return null;
    }
    return { discussKind: kind, [field]: id } as CoachDiscussMetadata;
  };
}

const PARSERS: Record<DiscussKind, MetadataParser> = {
  today: () => ({ discussKind: 'today' }),
  'morning-brief': (raw) =>
    typeof raw.trainingDayId === 'string' && TRAINING_DAY_PATTERN.test(raw.trainingDayId)
      ? { discussKind: 'morning-brief', trainingDayId: raw.trainingDayId }
      : null,
  'journal-analyses': () => ({ discussKind: 'journal-analyses' }),
  planning: (raw) =>
    PLANNING_HORIZONS.has(raw.horizonDays)
      ? { discussKind: 'planning', horizonDays: raw.horizonDays as 1 | 3 | 7 | 14 }
      : null,
  'planned-session': targetIdParser('planned-session', 'sessionId'),
  activity: targetIdParser('activity', 'activityId'),
  goal: targetIdParser('goal', 'goalId'),
  record: targetIdParser('record', 'categoryKey'),
  'physical-condition': targetIdParser('physical-condition', 'noteId'),
  nutrition: (raw) =>
    typeof raw.trainingDayId === 'string' && TRAINING_DAY_PATTERN.test(raw.trainingDayId)
      ? { discussKind: 'nutrition', trainingDayId: raw.trainingDayId }
      : null,
};

function isDiscussKind(value: unknown): value is DiscussKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PARSERS, value);
}

export function parseCoachDiscussMetadata(value: unknown): CoachDiscussMetadata | null {
  if (!isObject(value) || !isDiscussKind(value.discussKind)) {
    return null;
  }
  return PARSERS[value.discussKind](value);
}

function userMessageDiscussMetadata(message: unknown): RawObject | null {
  if (!isObject(message) || message.role !== 'user' || !isObject(message.metadata)) {
    return null;
  }
  return 'discussKind' in message.metadata ? message.metadata : null;
}

/**
 * The most recent user message that carries a discuss context decides what the
 * conversation is about; an athlete who attaches a new chip mid-conversation
 * moves the topic. If that message's metadata is malformed, nothing is applied.
 */
export function lastCoachDiscussMetadata(messages: unknown): CoachDiscussMetadata | null {
  if (!Array.isArray(messages)) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = userMessageDiscussMetadata(messages[index]);
    if (metadata) {
      return parseCoachDiscussMetadata(metadata);
    }
  }
  return null;
}
